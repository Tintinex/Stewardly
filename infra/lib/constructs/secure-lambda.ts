import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as kms from 'aws-cdk-lib/aws-kms'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
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
  dbClusterArn: string
  dbSecretArn: string
  dbName: string
  bucket: s3.Bucket
  kmsKey: kms.Key
  additionalEnv?: Record<string, string>
  additionalPolicies?: iam.PolicyStatement[]
}

export class SecureLambda extends Construct {
  public readonly function: lambda.Function

  constructor(scope: Construct, id: string, props: SecureLambdaProps) {
    super(scope, id)

    const {
      functionName, handler, codeAssetPath, stage, envConfig,
      vpc, lambdaSg, dbClusterArn, dbSecretArn, dbName,
      bucket, kmsKey, additionalEnv = {}, additionalPolicies = [],
    } = props

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

    // RDS Data API permissions
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'],
      resources: [dbClusterArn],
    }))

    // Secrets Manager
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
      resources: [dbSecretArn],
    }))

    // KMS
    kmsKey.grantDecrypt(role)
    kmsKey.grantEncrypt(role)

    // S3
    bucket.grantReadWrite(role)

    // X-Ray
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
      resources: ['*'],
    }))

    // API Gateway execute
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['execute-api:Invoke'],
      resources: ['*'],
    }))

    // Additional policies
    for (const policy of additionalPolicies) {
      role.addToPolicy(policy)
    }

    this.function = new lambda.Function(this, 'Fn', {
      functionName: `stewardly-${functionName}-${stage}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler,
      code: lambda.Code.fromAsset(codeAssetPath, {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash', '-c',
            `npm install && npx esbuild ${functionName}/index.ts --bundle --platform=node --target=node20 --outfile=/asset-output/index.js`,
          ],
        },
      }),
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
        DB_CLUSTER_ARN: dbClusterArn,
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
