import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import * as rds from 'aws-cdk-lib/aws-rds'
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { buildSync } from 'esbuild'
import { Construct } from 'constructs'
import type { EnvConfig } from '../config/environments'

const LOCAL_NM = 'C:\\stewardly-services-nm\\node_modules'
const SOURCE_NM = path.resolve(__dirname, '../../../services/node_modules')

import * as kms from 'aws-cdk-lib/aws-kms'

interface MigrationStackProps extends cdk.StackProps {
  stage: string
  envConfig: EnvConfig
  vpc: ec2.Vpc
  lambdaSg: ec2.SecurityGroup
  dbInstance: rds.DatabaseInstance
  dbSecret: secretsmanager.ISecret
  dbKmsKey: kms.Key
  storageKmsKey: kms.Key
  bucket: s3.Bucket
}

export class MigrationStack extends cdk.Stack {
  public readonly migrationFunction: lambda.Function

  constructor(scope: Construct, id: string, props: MigrationStackProps) {
    super(scope, id, props)

    const { stage, vpc, lambdaSg, dbInstance, dbSecret, dbKmsKey, storageKmsKey, bucket } = props

    const servicesAbsPath = path.resolve(__dirname, '../../../services')

    // ── Upload migration SQL files to S3 ────────────────────────────────────
    new s3deploy.BucketDeployment(this, 'MigrationFiles', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../../db/migrations'))],
      destinationBucket: bucket,
      destinationKeyPrefix: 'migrations/',
      prune: false,
    })

    // ── Migration Lambda role ───────────────────────────────────────────────
    const role = new iam.Role(this, 'MigrationRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    })

    role.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [dbSecret.secretArn],
    }))

    role.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:ListBucket'],
      resources: [bucket.bucketArn, `${bucket.bucketArn}/migrations/*`],
    }))

    // KMS decrypt needed for both: Secrets Manager (db key) and S3 bucket (storage key)
    dbKmsKey.grantDecrypt(role)
    storageKmsKey.grantDecrypt(role)

    // ── Bundled Lambda using esbuild (includes pg) ──────────────────────────
    this.migrationFunction = new lambda.Function(this, 'MigrationFn', {
      functionName: `stewardly-migrate-${stage}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(servicesAbsPath, {
        bundling: {
          local: {
            tryBundle(outputDir: string): boolean {
              try {
                buildSync({
                  entryPoints: [path.join(servicesAbsPath, 'migration-runner/src/index.ts')],
                  bundle: true,
                  platform: 'node',
                  target: 'node20',
                  external: ['@aws-sdk/*'],
                  outfile: path.join(outputDir, 'index.js'),
                  nodePaths: [LOCAL_NM, SOURCE_NM],
                })
                return true
              } catch (err) {
                console.error('[migration-stack] esbuild failed:', err)
                return false
              }
            },
          },
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash', '-c',
            'npm install && npx esbuild migration-runner/src/index.ts --bundle --platform=node --target=node20 --external:@aws-sdk/* --outfile=/asset-output/index.js',
          ],
        },
      }),
      role,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        DB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_PORT: dbInstance.dbInstanceEndpointPort,
        DB_SECRET_ARN: dbSecret.secretArn,
        DB_NAME: 'stewardly',
        S3_BUCKET: bucket.bucketName,
      },
      logGroup: new logs.LogGroup(this, 'MigrationLogs', {
        logGroupName: `/stewardly/${stage}/migrations`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    })

    new cdk.CfnOutput(this, 'MigrationFunctionName', {
      value: this.migrationFunction.functionName,
      description: 'Invoke this Lambda to run pending DB migrations',
    })
  }
}
