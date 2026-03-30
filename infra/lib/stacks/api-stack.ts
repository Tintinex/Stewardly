import * as cdk from 'aws-cdk-lib'
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as apigatewayv2integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as apigatewayv2authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as kms from 'aws-cdk-lib/aws-kms'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import { SecureLambda } from '../constructs/secure-lambda'
import type { EnvConfig } from '../config/environments'

interface ApiStackProps extends cdk.StackProps {
  stage: string
  envConfig: EnvConfig
  vpc: ec2.Vpc
  lambdaSg: ec2.SecurityGroup
  userPool: cognito.UserPool
  bucket: s3.Bucket
  dbCluster: rds.DatabaseCluster
  dbSecret: secretsmanager.ISecret
  kmsKey: kms.Key
}

export class ApiStack extends cdk.Stack {
  public readonly apiUrl: string

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props)

    const { stage, envConfig, vpc, lambdaSg, userPool, bucket, dbCluster, dbSecret, kmsKey } = props

    const serviceDir = '../services'
    const commonLambdaProps = {
      stage,
      envConfig,
      vpc,
      lambdaSg,
      dbClusterArn: dbCluster.clusterArn,
      dbSecretArn: dbSecret.secretArn,
      dbName: 'stewardly',
      bucket,
      kmsKey,
      codeAssetPath: serviceDir,
    }

    // Create Lambda functions for each service
    const dashboardLambda = new SecureLambda(this, 'DashboardLambda', {
      ...commonLambdaProps,
      functionName: 'dashboard-service',
      handler: 'index.handler',
    })

    const tasksLambda = new SecureLambda(this, 'TasksLambda', {
      ...commonLambdaProps,
      functionName: 'tasks-service',
      handler: 'index.handler',
    })

    const meetingsLambda = new SecureLambda(this, 'MeetingsLambda', {
      ...commonLambdaProps,
      functionName: 'meetings-service',
      handler: 'index.handler',
    })

    const residentsLambda = new SecureLambda(this, 'ResidentsLambda', {
      ...commonLambdaProps,
      functionName: 'residents-service',
      handler: 'index.handler',
    })

    const messagingLambda = new SecureLambda(this, 'MessagingLambda', {
      ...commonLambdaProps,
      functionName: 'messaging-service',
      handler: 'index.handler',
    })

    const financesLambda = new SecureLambda(this, 'FinancesLambda', {
      ...commonLambdaProps,
      functionName: 'finances-service',
      handler: 'index.handler',
      additionalPolicies: [
        new iam.PolicyStatement({
          actions: ['kms:Decrypt', 'kms:Encrypt', 'kms:GenerateDataKey'],
          resources: [kmsKey.keyArn],
        }),
      ],
    })

    // Health check Lambda (no auth)
    const healthLambdaRole = new iam.Role(this, 'HealthLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    })

    const healthLambda = new lambda.Function(this, 'HealthLambda', {
      functionName: `stewardly-health-${stage}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      role: healthLambdaRole,
      code: lambda.Code.fromInline(`
        exports.handler = async () => ({
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ status: 'ok', stage: '${stage}', timestamp: new Date().toISOString() }),
        });
      `),
      timeout: cdk.Duration.seconds(5),
      logGroup: new logs.LogGroup(this, 'HealthLogGroup', {
        logGroupName: `/stewardly/${stage}/health`,
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    })

    // Lambda Authorizer (must be built separately from services)
    const authorizerRole = new iam.Role(this, 'AuthorizerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    })

    const authorizerFn = new lambda.Function(this, 'AuthorizerFn', {
      functionName: `stewardly-authorizer-${stage}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      role: authorizerRole,
      code: lambda.Code.fromAsset(serviceDir, {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash', '-c',
            'npm install && npx esbuild shared/tenant-authorizer/index.ts --bundle --platform=node --target=node20 --outfile=/asset-output/index.js',
          ],
        },
      }),
      timeout: cdk.Duration.seconds(5),
      environment: {
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_REGION: cdk.Aws.REGION,
        STAGE: stage,
      },
      logGroup: new logs.LogGroup(this, 'AuthorizerLogGroup', {
        logGroupName: `/stewardly/${stage}/authorizer`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    })

    // HTTP API Gateway
    const httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: `stewardly-api-${stage}`,
      corsPreflight: {
        allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PATCH,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ['*'],
        maxAge: cdk.Duration.hours(1),
      },
    })

    // Lambda authorizer
    const authorizer = new apigatewayv2authorizers.HttpLambdaAuthorizer('LambdaAuthorizer', authorizerFn, {
      responseTypes: [apigatewayv2authorizers.HttpLambdaResponseType.SIMPLE],
      resultsCacheTtl: cdk.Duration.minutes(5),
    })

    // Helper to create integration
    const integration = (fn: lambda.Function) =>
      new apigatewayv2integrations.HttpLambdaIntegration(`${fn.functionName}Integration`, fn)

    // Routes — health (no auth)
    httpApi.addRoutes({
      path: '/health',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: integration(healthLambda),
    })

    // Protected routes
    const protectedRoutes: Array<{ path: string; methods: apigatewayv2.HttpMethod[]; fn: lambda.Function }> = [
      { path: '/api/dashboard',                      methods: [apigatewayv2.HttpMethod.GET],           fn: dashboardLambda.function },
      { path: '/api/tasks',                          methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST], fn: tasksLambda.function },
      { path: '/api/tasks/{taskId}',                 methods: [apigatewayv2.HttpMethod.PATCH, apigatewayv2.HttpMethod.DELETE], fn: tasksLambda.function },
      { path: '/api/meetings',                       methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST], fn: meetingsLambda.function },
      { path: '/api/meetings/{meetingId}',           methods: [apigatewayv2.HttpMethod.GET],           fn: meetingsLambda.function },
      { path: '/api/residents',                      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST], fn: residentsLambda.function },
      { path: '/api/residents/{residentId}',         methods: [apigatewayv2.HttpMethod.PATCH],         fn: residentsLambda.function },
      { path: '/api/boards',                         methods: [apigatewayv2.HttpMethod.GET],           fn: messagingLambda.function },
      { path: '/api/boards/{boardId}/threads',       methods: [apigatewayv2.HttpMethod.GET],           fn: messagingLambda.function },
      { path: '/api/threads/{threadId}/posts',       methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST], fn: messagingLambda.function },
      { path: '/api/finances',                       methods: [apigatewayv2.HttpMethod.GET],           fn: financesLambda.function },
    ]

    for (const route of protectedRoutes) {
      httpApi.addRoutes({
        path: route.path,
        methods: route.methods,
        integration: integration(route.fn),
        authorizer,
      })
    }

    this.apiUrl = httpApi.apiEndpoint

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      exportName: `stewardly-api-url-${stage}`,
    })
  }
}
