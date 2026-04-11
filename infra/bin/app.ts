#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { NetworkStack } from '../lib/stacks/network-stack'
import { StorageStack } from '../lib/stacks/storage-stack'
import { DatabaseStack } from '../lib/stacks/database-stack'
import { AuthStack } from '../lib/stacks/auth-stack'
import { ApiStack } from '../lib/stacks/api-stack'
import { WebStack } from '../lib/stacks/web-stack'
import { environments } from '../lib/config/environments'

const app = new cdk.App()

const stage = app.node.tryGetContext('stage') as string ?? 'dev'
const envConfig = environments[stage]

if (!envConfig) {
  throw new Error(`Unknown stage: ${stage}. Valid values: dev, staging, prod`)
}

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
}

const tags = {
  Project: 'Stewardly',
  Stage: stage,
  ManagedBy: 'CDK',
}

const network = new NetworkStack(app, `StewardlyNetwork-${stage}`, {
  env,
  stage,
  envConfig,
  tags,
})

const storage = new StorageStack(app, `StewardlyStorage-${stage}`, {
  env,
  stage,
  envConfig,
  tags,
})

const database = new DatabaseStack(app, `StewardlyDatabase-${stage}`, {
  env,
  stage,
  envConfig,
  vpc: network.vpc,
  databaseSg: network.databaseSg,
  tags,
})

const auth = new AuthStack(app, `StewardlyAuth-${stage}`, {
  env,
  stage,
  envConfig,
  tags,
})

const api = new ApiStack(app, `StewardlyApi-${stage}`, {
  env,
  stage,
  envConfig,
  vpc: network.vpc,
  lambdaSg: network.lambdaSg,
  userPool: auth.userPool,
  authorizerFunction: auth.authorizerFunction,
  bucket: storage.bucket,
  dbInstance: database.instance,
  dbSecret: database.secret,
  kmsKey: database.kmsKey,
  tags,
})

// Set CERTIFICATE_ARN env var after ACM cert is issued (see deployment guide)
const certificateArn = process.env.CERTIFICATE_ARN

new WebStack(app, `StewardlyWeb-${stage}`, {
  env,
  stage,
  envConfig,
  certificateArn,
  tags,
})

// Dependencies
database.addDependency(network)
api.addDependency(database)
api.addDependency(auth)
api.addDependency(storage)

cdk.Tags.of(app).add('Project', 'Stewardly')
cdk.Tags.of(app).add('Stage', stage)
