import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as kms from 'aws-cdk-lib/aws-kms'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { buildSync } from 'esbuild'
import { Construct } from 'constructs'
import type { EnvConfig } from '../config/environments'

export interface SecureLambdaProps {
  functionName: string
  handler: string
  codeAssetPath: string
  stage: string
  envConfig: EnvConfig
  vpc: ec2.Vpc
  lambdaSg: ec2.SecurityGroup
  /** RDS instance hostname */
  dbHost: string
  /** RDS instance port (e.g. "5432") */
  dbPort: string
  dbSecretArn: string
  dbName: string
  bucket: s3.Bucket
  kmsKey: kms.Key
  additionalEnv?: Record<string, string>
  additionalPolicies?: iam.PolicyStatement[]
}

/**
 * Local bundler using esbuild's JS API — runs in-process, no Docker or
 * network-drive node_modules required. Falls back to Docker if it throws.
 */
// node_modules are installed on C:\ to avoid network-drive (Y:\) I/O issues.
// If the path doesn't exist yet, fall back to the source-tree node_modules.
const LOCAL_NM = 'C:\\stewardly-services-nm\\node_modules'
const SOURCE_NM = path.resolve(__dirname, '../../../services/node_modules')

function makeLocalBundler(servicesAbsPath: string, entryPoint: string) {
  return {
    tryBundle(outputDir: string): boolean {
      try {
        buildSync({
          entryPoints: [path.join(servicesAbsPath, entryPoint)],
          bundle: true,
          platform: 'node',
          target: 'node22',
          external: ['@aws-sdk/*'],
          treeShaking: true,
          sourcemap: true,
          outfile: path.join(outputDir, 'index.js'),
          // Look for npm packages in the local-drive copy first, then source tree
          nodePaths: [LOCAL_NM, SOURCE_NM],
        })
        return true
      } catch (err) {
        console.error('[secure-lambda] Local esbuild failed, will try Docker:', err)
        return false
      }
    },
  }
}

export class SecureLambda extends Construct {
  public readonly function: lambda.Function

  constructor(scope: Construct, id: string, props: SecureLambdaProps) {
    super(scope, id)

    const {
      functionName, handler, codeAssetPath, stage, envConfig,
      vpc, lambdaSg, dbHost, dbPort, dbSecretArn, dbName,
      bucket, kmsKey, additionalEnv = {}, additionalPolicies = [],
    } = props

    // Resolve to absolute path at construct time so the local bundler works
    // regardless of the cwd when `cdk deploy` is invoked.
    const servicesAbsPath = path.resolve(codeAssetPath)

    const logRetention = envConfig.stage === 'prod'
      ? logs.RetentionDays.THREE_MONTHS
      : logs.RetentionDays.ONE_MONTH

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/stewardly/${stage}/${functionName}`,
      retention: logRetention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    })

    // Secrets Manager
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
      resources: [dbSecretArn],
    }))

    kmsKey.grantDecrypt(role)
    kmsKey.grantEncrypt(role)
    bucket.grantReadWrite(role)

    role.addToPolicy(new iam.PolicyStatement({
      actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
      resources: ['*'],
    }))

    role.addToPolicy(new iam.PolicyStatement({
      actions: ['execute-api:Invoke'],
      resources: ['*'],
    }))

    for (const policy of additionalPolicies) {
      role.addToPolicy(policy)
    }

    // Use pre-built dist/ artifact if it exists — avoids CDK's asset-staging
    // rename which fails on Windows with EPERM (file system lock).
    // The dist/ is built by: npx esbuild src/index.ts --bundle ... --outfile=dist/index.js
    const distDir = path.join(servicesAbsPath, functionName, 'dist')
    const fs = require('fs') as typeof import('fs')
    const distExists = fs.existsSync(path.join(distDir, 'index.js'))

    const code = distExists
      ? lambda.Code.fromAsset(distDir)
      : lambda.Code.fromAsset(codeAssetPath, {
          bundling: {
            local: makeLocalBundler(servicesAbsPath, `${functionName}/src/index.ts`),
            image: lambda.Runtime.NODEJS_22_X.bundlingImage,
            command: [
              'bash', '-c',
              [
                'npm install',
                `npx esbuild ${functionName}/src/index.ts`,
                '--bundle --platform=node --target=node22',
                '--external:@aws-sdk/* --tree-shaking=true --sourcemap',
                '--outfile=/asset-output/index.js',
              ].join(' '),
            ],
          },
        })

    this.function = new lambda.Function(this, 'Fn', {
      functionName: `stewardly-${functionName}-${stage}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler,
      code,
      role,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      memorySize: envConfig.lambdaMemoryMb,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      logGroup,
      environment: {
        STAGE: stage,
        DB_HOST: dbHost,
        DB_PORT: dbPort,
        DB_SECRET_ARN: dbSecretArn,
        DB_NAME: dbName,
        S3_BUCKET: bucket.bucketName,
        KMS_KEY_ARN: kmsKey.keyArn,
        NODE_OPTIONS: '--enable-source-maps',
        ...additionalEnv,
      },
    })
  }
}
