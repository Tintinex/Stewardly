import * as cdk from 'aws-cdk-lib'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import type { EnvConfig } from '../config/environments'

interface AuthStackProps extends cdk.StackProps {
  stage: string
  envConfig: EnvConfig
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool
  public readonly userPoolClient: cognito.UserPoolClient
  public readonly authorizerFunction: lambda.Function

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props)

    const { stage, envConfig } = props

    // Pre-token generation Lambda trigger
    const preTokenRole = new iam.Role(this, 'PreTokenRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    })

    const preTokenLogGroup = new logs.LogGroup(this, 'PreTokenLogs', {
      logGroupName: `/stewardly/${stage}/pre-token-generation`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const preTokenFn = new lambda.Function(this, 'PreTokenGenerationFn', {
      functionName: `stewardly-pre-token-${stage}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      role: preTokenRole,
      timeout: cdk.Duration.seconds(5),
      logGroup: preTokenLogGroup,
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          const hoaId = event.request.userAttributes['custom:hoaId'] || '';
          const role = event.request.userAttributes['custom:role'] || 'homeowner';
          const unitId = event.request.userAttributes['custom:unitId'] || '';
          event.response = {
            claimsOverrideDetails: {
              claimsToAddOrOverride: {
                'custom:hoaId': hoaId,
                'custom:role': role,
                'custom:unitId': unitId,
              },
            },
          };
          return event;
        };
      `),
    })

    // Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `stewardly-${stage}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: true, mutable: true },
        familyName: { required: true, mutable: true },
      },
      customAttributes: {
        hoaId:  new cognito.StringAttribute({ mutable: true, minLen: 0, maxLen: 36 }),
        role:   new cognito.StringAttribute({ mutable: true, minLen: 0, maxLen: 30 }),
        unitId: new cognito.StringAttribute({ mutable: true, minLen: 0, maxLen: 36 }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      lambdaTriggers: {
        preTokenGeneration: preTokenFn,
      },
      removalPolicy: envConfig.stage === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    })

    // App client (no client secret — SPA)
    this.userPoolClient = this.userPool.addClient('SpaClient', {
      userPoolClientName: `stewardly-spa-${stage}`,
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: false,
      },
      oAuth: {
        flows: { implicitCodeGrant: false, authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      preventUserExistenceErrors: true,
    })

    // Lambda Authorizer function
    const authorizerRole = new iam.Role(this, 'AuthorizerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    })

    const authorizerLogGroup = new logs.LogGroup(this, 'AuthorizerLogs', {
      logGroupName: `/stewardly/${stage}/authorizer`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    this.authorizerFunction = new lambda.Function(this, 'AuthorizerFunction', {
      functionName: `stewardly-authorizer-${stage}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../services', {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash', '-c',
            'npm install && npx esbuild shared/tenant-authorizer/index.ts --bundle --platform=node --target=node20 --outfile=/asset-output/index.js',
          ],
        },
      }),
      role: authorizerRole,
      timeout: cdk.Duration.seconds(5),
      logGroup: authorizerLogGroup,
      environment: {
        STAGE: stage,
        COGNITO_USER_POOL_ID: this.userPool.userPoolId,
        COGNITO_REGION: cdk.Aws.REGION,
      },
    })

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `stewardly-user-pool-id-${stage}`,
    })

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: `stewardly-user-pool-client-id-${stage}`,
    })
  }
}
