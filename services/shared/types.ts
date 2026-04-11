import type { APIGatewayProxyEventV2WithLambdaAuthorizer } from 'aws-lambda'

export interface AuthorizerContext {
  hoaId: string
  userId: string
  role: 'homeowner' | 'board_member' | 'board_admin' | 'superadmin'
}

export type LambdaEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>
