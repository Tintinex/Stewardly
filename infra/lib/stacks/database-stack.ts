import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as kms from 'aws-cdk-lib/aws-kms'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import type { EnvConfig } from '../config/environments'

interface DatabaseStackProps extends cdk.StackProps {
  stage: string
  envConfig: EnvConfig
  vpc: ec2.Vpc
  databaseSg: ec2.SecurityGroup
}

export class DatabaseStack extends cdk.Stack {
  /** Standard RDS PostgreSQL instance — free-tier eligible (db.t3.micro) */
  public readonly instance: rds.DatabaseInstance
  public readonly secret: secretsmanager.ISecret
  public readonly kmsKey: kms.Key
  public readonly financialKmsKey: kms.Key

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props)

    const { stage, envConfig, vpc, databaseSg } = props

    // KMS key for database encryption
    this.kmsKey = new kms.Key(this, 'DatabaseKey', {
      alias: `stewardly-database-${stage}`,
      description: 'KMS key for Stewardly PostgreSQL instance',
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

    // RDS PostgreSQL — db.t3.micro is free-tier eligible (750 hrs/month for 12 months)
    this.instance = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: envConfig.stage === 'prod'
        ? ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM)
        : ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [databaseSg],
      databaseName: 'stewardly',
      credentials: rds.Credentials.fromGeneratedSecret('stewardly_admin', {
        secretName: `stewardly/${stage}/db-credentials`,
        encryptionKey: this.kmsKey,
      }),
      storageEncrypted: true,
      storageEncryptionKey: this.kmsKey,
      backupRetention: envConfig.stage === 'prod'
        ? cdk.Duration.days(30)
        : cdk.Duration.days(1),
      deletionProtection: envConfig.stage === 'prod',
      removalPolicy: envConfig.stage === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      multiAz: envConfig.auroraMultiAz,
      autoMinorVersionUpgrade: true,
      // Performance Insights only on prod (additional cost on free tier)
      enablePerformanceInsights: envConfig.stage === 'prod',
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: envConfig.stage === 'prod'
        ? logs.RetentionDays.THREE_MONTHS
        : logs.RetentionDays.ONE_MONTH,
    })

    this.secret = this.instance.secret!

    // Migration Lambda — placeholder; run actual migrations manually via DEPLOYMENT.md
    const migrationLambdaRole = new iam.Role(this, 'MigrationLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    })

    this.secret.grantRead(migrationLambdaRole)
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
        exports.handler = async (event) => {
          console.log('Migration Lambda triggered', JSON.stringify(event));
          return { statusCode: 200, body: 'Run migrations via psql — see DEPLOYMENT.md' };
        };
      `),
      role: migrationLambdaRole,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      timeout: cdk.Duration.minutes(5),
      environment: {
        STAGE: stage,
        DB_SECRET_ARN: this.secret.secretArn,
        DB_NAME: 'stewardly',
        DB_HOST: this.instance.dbInstanceEndpointAddress,
        DB_PORT: this.instance.dbInstanceEndpointPort,
      },
      logGroup: migrationLogGroup,
    })

    // Outputs
    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: this.instance.dbInstanceEndpointAddress,
      exportName: `stewardly-db-endpoint-${stage}`,
    })

    new cdk.CfnOutput(this, 'DbPort', {
      value: this.instance.dbInstanceEndpointPort,
      exportName: `stewardly-db-port-${stage}`,
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
