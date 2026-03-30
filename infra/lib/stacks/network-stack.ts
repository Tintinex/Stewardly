import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { Construct } from 'constructs'
import type { EnvConfig } from '../config/environments'

interface NetworkStackProps extends cdk.StackProps {
  stage: string
  envConfig: EnvConfig
}

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc
  public readonly lambdaSg: ec2.SecurityGroup
  public readonly databaseSg: ec2.SecurityGroup
  public readonly cacheSg: ec2.SecurityGroup

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props)

    const { stage, envConfig } = props

    // VPC with public, private, and isolated subnets
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `stewardly-${stage}`,
      cidr: '10.0.0.0/16',
      maxAzs: envConfig.auroraMultiAz ? 2 : 2,
      natGateways: envConfig.stage === 'prod' ? 2 : 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    })

    // Lambda security group
    this.lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc: this.vpc,
      securityGroupName: `stewardly-lambda-${stage}`,
      description: 'Security group for Stewardly Lambda functions',
      allowAllOutbound: true,
    })

    // Database security group — only allows inbound from Lambda
    this.databaseSg = new ec2.SecurityGroup(this, 'DatabaseSg', {
      vpc: this.vpc,
      securityGroupName: `stewardly-database-${stage}`,
      description: 'Security group for Stewardly Aurora cluster',
      allowAllOutbound: false,
    })
    this.databaseSg.addIngressRule(
      this.lambdaSg,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL from Lambda functions',
    )

    // Cache security group (for future ElastiCache)
    this.cacheSg = new ec2.SecurityGroup(this, 'CacheSg', {
      vpc: this.vpc,
      securityGroupName: `stewardly-cache-${stage}`,
      description: 'Security group for Stewardly ElastiCache',
      allowAllOutbound: false,
    })
    this.cacheSg.addIngressRule(
      this.lambdaSg,
      ec2.Port.tcp(6379),
      'Allow Redis from Lambda functions',
    )

    // VPC Endpoints to reduce NAT Gateway costs
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    })

    this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSg],
    })

    this.vpc.addInterfaceEndpoint('KmsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.KMS,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSg],
    })

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      exportName: `stewardly-vpc-id-${stage}`,
    })

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: this.vpc.privateSubnets.map(s => s.subnetId).join(','),
      exportName: `stewardly-private-subnet-ids-${stage}`,
    })
  }
}
