import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as kms from 'aws-cdk-lib/aws-kms'
import { Construct } from 'constructs'
import type { EnvConfig } from '../config/environments'

interface StorageStackProps extends cdk.StackProps {
  stage: string
  envConfig: EnvConfig
}

export class StorageStack extends cdk.Stack {
  public readonly bucket: s3.Bucket

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props)

    const { stage, envConfig } = props

    // KMS key for S3 encryption
    const storageKey = new kms.Key(this, 'StorageKey', {
      alias: `stewardly-storage-${stage}`,
      description: 'KMS key for Stewardly S3 documents bucket',
      enableKeyRotation: true,
      removalPolicy: envConfig.stage === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    })

    // Documents bucket
    this.bucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: `stewardly-documents-${cdk.Aws.ACCOUNT_ID}-${stage}`,
      versioned: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: storageKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: envConfig.stage === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: envConfig.stage !== 'prod',
      lifecycleRules: [
        {
          id: 'MoveToIA',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
        },
        {
          id: 'ExpireOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(180),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    })

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      exportName: `stewardly-bucket-name-${stage}`,
    })

    new cdk.CfnOutput(this, 'BucketArn', {
      value: this.bucket.bucketArn,
      exportName: `stewardly-bucket-arn-${stage}`,
    })
  }
}
