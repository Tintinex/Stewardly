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
  /** Authorizer Lambda created by AuthStack — passed in to avoid duplicate resources */
  authorizerFunction: lambda.Function
  bucket: s3.Bucket
  dbInstance: rds.DatabaseInstance
  dbSecret: secretsmanager.ISecret
  kmsKey: kms.Key
}

// Re-export for convenience
export type { ApiStackProps }

export class ApiStack extends cdk.Stack {
  public readonly apiUrl: string

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props)

    const { stage, envConfig, vpc, lambdaSg, userPool, authorizerFunction, bucket, dbInstance, dbSecret, kmsKey } = props

    const serviceDir = '../services'
    const commonLambdaProps = {
      stage,
      envConfig,
      vpc,
      lambdaSg,
      dbHost: dbInstance.dbInstanceEndpointAddress,
      dbPort: dbInstance.dbInstanceEndpointPort,
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

    const adminLambda = new SecureLambda(this, 'AdminLambda', {
      ...commonLambdaProps,
      functionName: 'admin-service',
      handler: 'index.handler',
      additionalEnv: {
        COGNITO_USER_POOL_ID: userPool.userPoolId,
      },
      additionalPolicies: [
        new iam.PolicyStatement({
          actions: [
            'cognito-idp:ListUsers',
            'cognito-idp:AdminCreateUser',
            'cognito-idp:AdminDisableUser',
            'cognito-idp:AdminEnableUser',
            'cognito-idp:AdminResetUserPassword',
            'cognito-idp:AdminUpdateUserAttributes',
          ],
          resources: [userPool.userPoolArn],
        }),
        new iam.PolicyStatement({
          // CloudWatch does not support resource-level restrictions for these actions
          actions: [
            'cloudwatch:GetMetricData',
            'cloudwatch:GetMetricStatistics',
            'logs:FilterLogEvents',
            'logs:DescribeLogGroups',
          ],
          resources: ['*'],
        }),
      ],
    })

    // ── Anthropic API key secret ──────────────────────────────────────────────
    // Create once; user updates the value via AWS Console or CLI:
    //   aws secretsmanager update-secret \
    //     --secret-id stewardly/dev/anthropic-api-key \
    //     --secret-string "sk-ant-..."
    const anthropicSecret = new secretsmanager.Secret(this, 'AnthropicApiKey', {
      secretName: `stewardly/${stage}/anthropic-api-key`,
      description: 'Anthropic Claude API key for AI document processing',
      secretStringValue: cdk.SecretValue.unsafePlainText('REPLACE_ME'),
    })

    // ── Plaid credentials secret ──────────────────────────────────────────────
    // Create once; update values via AWS Console or CLI:
    //   aws secretsmanager update-secret \
    //     --secret-id stewardly/dev/plaid-credentials \
    //     --secret-string '{"clientId":"...","secret":"...","environment":"sandbox"}'
    const plaidSecret = new secretsmanager.Secret(this, 'PlaidCredentials', {
      secretName: `stewardly/${stage}/plaid-credentials`,
      description: 'Plaid API credentials for bank account connectivity',
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({ clientId: 'REPLACE_ME', secret: 'REPLACE_ME', environment: 'sandbox' }),
      ),
    })

    // Give residents Lambda access to Anthropic secret for document scanning
    residentsLambda.function.addEnvironment('ANTHROPIC_SECRET_ARN', anthropicSecret.secretArn)
    residentsLambda.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [anthropicSecret.secretArn],
      }),
    )

    // Give finances Lambda access to Plaid secret
    financesLambda.function.addEnvironment('PLAID_SECRET_ARN', plaidSecret.secretArn)
    financesLambda.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [plaidSecret.secretArn],
      }),
    )

    // ── Document Processor Lambda ─────────────────────────────────────────────
    // Invoked async (InvocationType: Event) from residents-service after upload.
    const documentProcessorLambda = new SecureLambda(this, 'DocumentProcessorLambda', {
      ...commonLambdaProps,
      functionName: 'document-processor',
      handler: 'index.handler',
      additionalEnv: {
        ANTHROPIC_SECRET_ARN: anthropicSecret.secretArn,
      },
      additionalPolicies: [
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [anthropicSecret.secretArn],
        }),
      ],
    })

    // Give residents-service permission to invoke the processor async
    documentProcessorLambda.function.grantInvoke(residentsLambda.function)

    // Inject processor function name into residents-service
    residentsLambda.function.addEnvironment(
      'DOCUMENT_PROCESSOR_FUNCTION_NAME',
      documentProcessorLambda.function.functionName,
    )

    // Signup Lambda — public (no authorizer); handles invite validation + HOA self-registration
    const signupLambda = new SecureLambda(this, 'SignupLambda', {
      ...commonLambdaProps,
      functionName: 'signup-service',
      handler: 'index.handler',
      additionalEnv: {
        COGNITO_USER_POOL_ID: userPool.userPoolId,
      },
      additionalPolicies: [
        new iam.PolicyStatement({
          actions: [
            'cognito-idp:AdminCreateUser',
            'cognito-idp:AdminSetUserPassword',
            'cognito-idp:AdminUpdateUserAttributes',
          ],
          resources: [userPool.userPoolArn],
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
      runtime: lambda.Runtime.NODEJS_22_X,
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

    // Lambda authorizer — reuse the function created by AuthStack
    const authorizer = new apigatewayv2authorizers.HttpLambdaAuthorizer('LambdaAuthorizer', authorizerFunction, {
      responseTypes: [apigatewayv2authorizers.HttpLambdaResponseType.SIMPLE],
      resultsCacheTtl: cdk.Duration.minutes(5),
    })

    // Helper to create integration — id must be a plain string (no CDK tokens)
    const integration = (id: string, fn: lambda.Function) =>
      new apigatewayv2integrations.HttpLambdaIntegration(`${id}Integration`, fn)

    // Routes — health (no auth)
    httpApi.addRoutes({
      path: '/health',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: integration('Health', healthLambda),
    })

    // Public — invite code validation (no authorizer — resident sign-up flow)
    httpApi.addRoutes({
      path: '/auth/validate-invite',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: integration('ValidateInvite', signupLambda.function),
    })

    // Public — HOA self-registration (no authorizer — creates new HOA + board_admin user)
    httpApi.addRoutes({
      path: '/auth/register-hoa',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: integration('RegisterHoa', signupLambda.function),
    })

    // Protected routes — id must be unique per construct and contain no CDK tokens
    const protectedRoutes: Array<{ id: string; path: string; methods: apigatewayv2.HttpMethod[]; fn: lambda.Function }> = [
      { id: 'Dashboard',         path: '/api/dashboard',                methods: [apigatewayv2.HttpMethod.GET],                                    fn: dashboardLambda.function },
      { id: 'Tasks',             path: '/api/tasks',                    methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],        fn: tasksLambda.function },
      { id: 'TaskById',          path: '/api/tasks/{taskId}',           methods: [apigatewayv2.HttpMethod.PATCH, apigatewayv2.HttpMethod.DELETE],    fn: tasksLambda.function },
      { id: 'Meetings',          path: '/api/meetings',                 methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],        fn: meetingsLambda.function },
      { id: 'MeetingById',       path: '/api/meetings/{meetingId}',     methods: [apigatewayv2.HttpMethod.GET],                                    fn: meetingsLambda.function },
      { id: 'Residents',         path: '/api/residents',                methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],        fn: residentsLambda.function },
      { id: 'ResidentById',      path: '/api/residents/{residentId}',   methods: [apigatewayv2.HttpMethod.PATCH],                                   fn: residentsLambda.function },
      { id: 'Boards',            path: '/api/boards',                   methods: [apigatewayv2.HttpMethod.GET],                                    fn: messagingLambda.function },
      { id: 'BoardThreads',      path: '/api/boards/{boardId}/threads',  methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],       fn: messagingLambda.function },
      { id: 'ThreadPosts',       path: '/api/threads/{threadId}/posts',  methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],       fn: messagingLambda.function },
      { id: 'Finances',                    path: '/api/finances',                                     methods: [apigatewayv2.HttpMethod.GET],                                                         fn: financesLambda.function },
      { id: 'FinancesAnalytics',           path: '/api/finances/analytics',                           methods: [apigatewayv2.HttpMethod.GET],                                                         fn: financesLambda.function },
      { id: 'FinancesBudget',              path: '/api/finances/budget',                              methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],                            fn: financesLambda.function },
      { id: 'FinancesBudgetImport',        path: '/api/finances/budget/import',                       methods: [apigatewayv2.HttpMethod.POST],                                                        fn: financesLambda.function },
      { id: 'FinancesBudgetApprove',       path: '/api/finances/budget/{budgetId}/approve',           methods: [apigatewayv2.HttpMethod.POST],                                                        fn: financesLambda.function },
      { id: 'FinancesTransactions',        path: '/api/finances/transactions',                        methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],                            fn: financesLambda.function },
      { id: 'FinancesTransactionsImport',  path: '/api/finances/transactions/import',                 methods: [apigatewayv2.HttpMethod.POST],                                                        fn: financesLambda.function },
      { id: 'FinancesTransactionById',     path: '/api/finances/transactions/{transactionId}',        methods: [apigatewayv2.HttpMethod.PATCH, apigatewayv2.HttpMethod.DELETE],                        fn: financesLambda.function },
      { id: 'FinancesAccounts',            path: '/api/finances/accounts',                            methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],                            fn: financesLambda.function },
      { id: 'FinancesAccountById',         path: '/api/finances/accounts/{accountId}',                methods: [apigatewayv2.HttpMethod.PATCH, apigatewayv2.HttpMethod.DELETE],                        fn: financesLambda.function },
      { id: 'FinancesAssessments',         path: '/api/finances/assessments',                         methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],                            fn: financesLambda.function },
      { id: 'FinancesAssessmentsBulk',     path: '/api/finances/assessments/bulk',                    methods: [apigatewayv2.HttpMethod.POST],                                                        fn: financesLambda.function },
      { id: 'FinancesAssessmentById',      path: '/api/finances/assessments/{assessmentId}',          methods: [apigatewayv2.HttpMethod.PATCH, apigatewayv2.HttpMethod.DELETE],                        fn: financesLambda.function },
      { id: 'FinancesPlaidLinkToken',     path: '/api/finances/plaid/link-token',                    methods: [apigatewayv2.HttpMethod.POST],                                                        fn: financesLambda.function },
      { id: 'FinancesPlaidExchange',      path: '/api/finances/plaid/exchange',                      methods: [apigatewayv2.HttpMethod.POST],                                                        fn: financesLambda.function },
      { id: 'FinancesPlaidItems',         path: '/api/finances/plaid/items',                         methods: [apigatewayv2.HttpMethod.GET],                                                         fn: financesLambda.function },
      { id: 'FinancesPlaidItemById',      path: '/api/finances/plaid/items/{itemId}',                methods: [apigatewayv2.HttpMethod.DELETE],                                                      fn: financesLambda.function },
      { id: 'FinancesPlaidSync',          path: '/api/finances/plaid/sync/{itemId}',                 methods: [apigatewayv2.HttpMethod.POST],                                                        fn: financesLambda.function },
      // Resident-facing routes
      { id: 'EnsureOwner',       path: '/api/residents/me',              methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST, apigatewayv2.HttpMethod.PATCH], fn: residentsLambda.function },
      { id: 'MyUnit',            path: '/api/my-unit',                   methods: [apigatewayv2.HttpMethod.GET],                                     fn: residentsLambda.function },
      { id: 'Maintenance',       path: '/api/maintenance-requests',      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],       fn: residentsLambda.function },
      { id: 'Documents',             path: '/api/documents',                          methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],  fn: residentsLambda.function },
      { id: 'DocumentsPresignedUrl', path: '/api/documents/presigned-url',            methods: [apigatewayv2.HttpMethod.POST],                                fn: residentsLambda.function },
      { id: 'DocumentsFromDrive',    path: '/api/documents/from-drive',               methods: [apigatewayv2.HttpMethod.POST],                                fn: residentsLambda.function },
      { id: 'DocumentDownload',      path: '/api/documents/{documentId}/download',    methods: [apigatewayv2.HttpMethod.GET],                                 fn: residentsLambda.function },
      { id: 'DocumentDelete',        path: '/api/documents/{documentId}',             methods: [apigatewayv2.HttpMethod.DELETE],                              fn: residentsLambda.function },
      { id: 'DocumentsAsk',          path: '/api/documents/ask',                      methods: [apigatewayv2.HttpMethod.POST],                                fn: residentsLambda.function },
      // Unit management (board_admin / board_member, role-enforced in Lambda)
      { id: 'Units',             path: '/api/units',                          methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],    fn: residentsLambda.function },
      { id: 'UnitsImport',       path: '/api/units/import',                   methods: [apigatewayv2.HttpMethod.POST],                                fn: residentsLambda.function },
      { id: 'UnitsScanDocument', path: '/api/units/scan-document',            methods: [apigatewayv2.HttpMethod.POST],                                fn: residentsLambda.function },
      { id: 'UnitsDocuments',    path: '/api/units/documents',                methods: [apigatewayv2.HttpMethod.GET],                                 fn: residentsLambda.function },
      { id: 'UnitById',          path: '/api/units/{unitId}',                 methods: [apigatewayv2.HttpMethod.PATCH, apigatewayv2.HttpMethod.DELETE], fn: residentsLambda.function },
      // HOA-admin routes (board_admin / board_member, role-enforced in Lambda)
      { id: 'HoaStats',          path: '/api/hoa/stats',                 methods: [apigatewayv2.HttpMethod.GET],                                     fn: residentsLambda.function },
      { id: 'HoaMembers',        path: '/api/hoa/members',               methods: [apigatewayv2.HttpMethod.GET],                                     fn: residentsLambda.function },
      { id: 'HoaMemberStatus',   path: '/api/hoa/members/{memberId}/status', methods: [apigatewayv2.HttpMethod.PATCH],                               fn: residentsLambda.function },
      { id: 'HoaInviteCode',     path: '/api/hoa/invite-code',           methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],       fn: residentsLambda.function },
      { id: 'HoaActivity',       path: '/api/hoa/activity',              methods: [apigatewayv2.HttpMethod.GET],                                     fn: residentsLambda.function },
      // Admin routes — superadmin role enforced in the Lambda itself
      { id: 'AdminDashboard',         path: '/api/admin/dashboard',                          methods: [apigatewayv2.HttpMethod.GET],                                      fn: adminLambda.function },
      { id: 'AdminHoas',              path: '/api/admin/hoas',                               methods: [apigatewayv2.HttpMethod.GET],                                      fn: adminLambda.function },
      { id: 'AdminHoaHealth',          path: '/api/admin/hoas/{hoaId}/health',                methods: [apigatewayv2.HttpMethod.GET],                                      fn: adminLambda.function },
      { id: 'AdminHoaInviteCode',     path: '/api/admin/hoas/{hoaId}/invite-code',           methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],         fn: adminLambda.function },
      { id: 'AdminHoaAdminUser',      path: '/api/admin/hoas/{hoaId}/admin-user',            methods: [apigatewayv2.HttpMethod.POST],                                      fn: adminLambda.function },
      { id: 'AdminHoaUsers',          path: '/api/admin/hoas/{hoaId}/users/{userId}',        methods: [apigatewayv2.HttpMethod.DELETE],                                    fn: adminLambda.function },
      { id: 'AdminHoaById',           path: '/api/admin/hoas/{hoaId}',                       methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PATCH],         fn: adminLambda.function },
      { id: 'AdminUsers',             path: '/api/admin/users',                              methods: [apigatewayv2.HttpMethod.GET],                                      fn: adminLambda.function },
      { id: 'AdminUserById',          path: '/api/admin/users/{userId}',                     methods: [apigatewayv2.HttpMethod.PATCH],                                    fn: adminLambda.function },
      { id: 'AdminUserDisable',       path: '/api/admin/users/{userId}/disable',             methods: [apigatewayv2.HttpMethod.POST],                                     fn: adminLambda.function },
      { id: 'AdminUserEnable',        path: '/api/admin/users/{userId}/enable',              methods: [apigatewayv2.HttpMethod.POST],                                     fn: adminLambda.function },
      { id: 'AdminUserReset',         path: '/api/admin/users/{userId}/reset-password',      methods: [apigatewayv2.HttpMethod.POST],                                     fn: adminLambda.function },
      { id: 'AdminStats',             path: '/api/admin/stats',                              methods: [apigatewayv2.HttpMethod.GET],                                      fn: adminLambda.function },
      { id: 'AdminMonitoring',        path: '/api/admin/monitoring',                         methods: [apigatewayv2.HttpMethod.GET],                                      fn: adminLambda.function },
      { id: 'AdminBilling',           path: '/api/admin/billing',                            methods: [apigatewayv2.HttpMethod.GET],                                      fn: adminLambda.function },
      { id: 'AdminSubscriptions',     path: '/api/admin/subscriptions',                      methods: [apigatewayv2.HttpMethod.GET],                                      fn: adminLambda.function },
      { id: 'AdminSubscriptionById',  path: '/api/admin/subscriptions/{hoaId}',              methods: [apigatewayv2.HttpMethod.PATCH],                                    fn: adminLambda.function },
      { id: 'AdminExtendTrial',       path: '/api/admin/subscriptions/{hoaId}/extend-trial', methods: [apigatewayv2.HttpMethod.POST],                                     fn: adminLambda.function },
      { id: 'AdminActivity',          path: '/api/admin/activity',                           methods: [apigatewayv2.HttpMethod.GET],                                      fn: adminLambda.function },
    ]

    for (const route of protectedRoutes) {
      httpApi.addRoutes({
        path: route.path,
        methods: route.methods,
        integration: integration(route.id, route.fn),
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
