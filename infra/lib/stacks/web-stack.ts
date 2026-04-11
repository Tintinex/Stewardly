import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as path from 'path'
import * as fs from 'fs'
import { Construct } from 'constructs'
import type { EnvConfig } from '../config/environments'

interface WebStackProps extends cdk.StackProps {
  stage: string
  envConfig: EnvConfig
  /** ACM certificate ARN (must be in us-east-1). Pass undefined to skip custom domain. */
  certificateArn?: string
}

export class WebStack extends cdk.Stack {
  public readonly marketingUrl: string

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props)

    const { stage, envConfig, certificateArn } = props

    const isProd = envConfig.stage === 'prod'
    const domainNames = certificateArn
      ? ['stewardly.biz', 'www.stewardly.biz']
      : undefined

    // ── Marketing site bucket (private — CloudFront only) ───────────────────
    const siteBucket = new s3.Bucket(this, 'MarketingBucket', {
      bucketName: `stewardly-marketing-${cdk.Aws.ACCOUNT_ID}-${stage}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    })

    // ── CloudFront Origin Access Control ───────────────────────────────────
    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: `Stewardly marketing site OAC (${stage})`,
    })

    // ── Security headers response policy ───────────────────────────────────
    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: `stewardly-security-headers-${stage}`,
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.seconds(31536000),
          includeSubdomains: true,
          override: true,
        },
        xssProtection: { protection: true, modeBlock: true, override: true },
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            "default-src 'self'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "script-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https://images.unsplash.com",
            "connect-src 'self' https://app.stewardly.biz",
          ].join('; '),
          override: true,
        },
      },
    })

    // ── CloudFront distribution ─────────────────────────────────────────────
    const distribution = new cloudfront.Distribution(this, 'MarketingCdn', {
      comment: `Stewardly marketing site (${stage})`,
      defaultRootObject: 'index.html',
      domainNames,
      certificate: certificateArn
        ? acm.Certificate.fromCertificateArn(this, 'SiteCert', certificateArn)
        : undefined,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket, { originAccessControl: oac }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        compress: true,
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    })

    // ── Deploy marketing site files ─────────────────────────────────────────
    const indexHtml = fs.readFileSync(
      path.join(__dirname, '../../..', 'index.html'),
      'utf-8',
    )

    new s3deploy.BucketDeployment(this, 'DeployMarketing', {
      sources: [s3deploy.Source.data('index.html', indexHtml)],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      prune: true,
    })

    // ── Outputs ────────────────────────────────────────────────────────────
    this.marketingUrl = domainNames
      ? 'https://stewardly.biz'
      : `https://${distribution.distributionDomainName}`

    new cdk.CfnOutput(this, 'MarketingUrl', {
      value: this.marketingUrl,
      description: 'Marketing website URL',
      exportName: `stewardly-marketing-url-${stage}`,
    })

    new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: distribution.distributionDomainName,
      description: 'CloudFront domain (use for Cloudflare CNAME)',
      exportName: `stewardly-cf-domain-${stage}`,
    })

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
      exportName: `stewardly-marketing-cf-id-${stage}`,
    })
  }
}
