import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as kms from 'aws-cdk-lib/aws-kms'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'
import * as path from 'path'
import type { EnvConfig } from '../config/environments'

interface DatabaseStackProps extends cdk.StackProps {
  stage: string
  envConfig: EnvConfig
  vpc: ec2.Vpc
  databaseSg: ec2.SecurityGroup
}

export class DatabaseStack extends cdk.Stack {
  public readonly cluster: rds.DatabaseCluster
  public readonly secret: secretsmanager.ISecret
  public readonly kmsKey: kms.Key
  public readonly financialKmsKey: kms.Key

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props)

    const { stage, envConfig, vpc, databaseSg } = props

    // KMS key for database encryption
    this.kmsKey = new kms.Key(this, 'DatabaseKey', {
      alias: `stewardly-database-${stage}`,
      description: 'KMS key for Stewardly Aurora cluster',
      enableKeyRotation: true,
      removalPolicy: envConfig.stage === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    })

    // Separate KMS key for financial data
    this.financialKmsKey = new kms.Key(this, 'FinancialDataKey', {
      alias: `stewardly-financial-${stage}`,
      description: 'KMS key for Stewardly financial data (extra isolation)',
      enableKeyRotation: true,
      removalPolicy: envConfig.stage === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    })

    // Aurora Serverless v2 PostgreSQL cluster
    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      clusterIdentifier: `stewardly-${stage}`,
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_4,
      }),
      credentials: rds.Credentials.fromGeneratedSecret('stewardly_admin', {
        secretName: `stewardly/${stage}/db-credentials`,
        encryptionKey: this.kmsKey,
      }),
      serverlessV2MinCapacity: envConfig.auroraMinAcu,
      serverlessV2MaxCapacity: envConfig.auroraMaxAcu,
      writer: rds.ClusterInstance.serverlessV2('Writer', {
        enablePerformanceInsights: envConfig.stage !== 'dev',
        publiclyAccessible: false,
      }),
      readers: envConfig.auroraMultiAz
        ? [
            rds.ClusterInstance.serverlessV2('Reader', {
              scaleWithWriter: true,
              enablePerformanceInsights: true,
            }),
          ]
        : [],
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [databaseSg],
      defaultDatabaseName: 'stewardly',
      storageEncrypted: true,
      storageEncryptionKey: this.kmsKey,
      enableDataApi: true,
      deletionProtection: envConfig.stage === 'prod',
      removalPolicy: envConfig.stage === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      backup: {
        retention: envConfig.stage === 'prod' ? cdk.Duration.days(30) : cdk.Duration.days(7),
      },
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: envConfig.stage === 'prod'
        ? logs.RetentionDays.THREE_MONTHS
        : logs.RetentionDays.ONE_MONTH,
    })

    this.secret = this.cluster.secret!

    // Migration Lambda (runs SQL from services/shared/migrations)
    const migrationLambdaRole = new cdk.aws_iam.Role(this, 'MigrationLambdaRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    })

    this.secret.grantRead(migrationLambdaRole)
    this.cluster.grantDataApiAccess(migrationLambdaRole)
    this.kmsKey.grantDecrypt(migrationLambdaRole)

    const migrationLogGroup = new logs.LogGroup(this, 'MigrationLogs', {
      logGroupName: `/stewardly/${stage}/migration`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    new lambda.Function(this, 'MigrationFunction', {
      functionName: `stewardly-migration-${stage}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');
        exports.handler = async (event) => {
          console.log('Migration Lambda triggered', JSON.stringify(event));
          // Full migration code is in services/shared/migration/
          return { statusCode: 200, body: 'Migration Lambda placeholder - deploy with actual code' };
        };
      `),
      role: migrationLambdaRole,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      timeout: cdk.Duration.minutes(5),
      environment: {
        STAGE: stage,
        DB_CLUSTER_ARN: this.cluster.clusterArn,
        DB_SECRET_ARN: this.secret.secretArn,
        DB_NAME: 'stewardly',
      },
      logGroup: migrationLogGroup,
    })

    // Outputs
    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      exportName: `stewardly-db-cluster-arn-${stage}`,
    })

    new cdk.CfnOutput(this, 'SecretArn', {
      value: this.secret.secretArn,
      exportName: `stewardly-db-secret-arn-${stage}`,
    })

    new cdk.CfnOutput(this, 'KmsKeyArn', {
      value: this.kmsKey.keyArn,
      exportName: `stewardly-db-kms-key-arn-${stage}`,
    })
  }
}
