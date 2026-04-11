export interface EnvConfig {
  stage: 'dev' | 'staging' | 'prod'
  auroraMinAcu: number
  auroraMaxAcu: number
  auroraMultiAz: boolean
  lambdaMemoryMb: number
  enableWaf: boolean
  enableElastiCache: boolean
}

export const environments: Record<string, EnvConfig> = {
  dev: {
    stage: 'dev',
    auroraMinAcu: 0,   // scale to zero when idle — saves ~$7/month
    auroraMaxAcu: 2,
    auroraMultiAz: false,
    lambdaMemoryMb: 256,
    enableWaf: false,
    enableElastiCache: false,
  },
  staging: {
    stage: 'staging',
    auroraMinAcu: 0.5,
    auroraMaxAcu: 4,
    auroraMultiAz: false,
    lambdaMemoryMb: 512,
    enableWaf: false,
    enableElastiCache: false,
  },
  prod: {
    stage: 'prod',
    auroraMinAcu: 2,
    auroraMaxAcu: 32,
    auroraMultiAz: true,
    lambdaMemoryMb: 1024,
    enableWaf: true,
    enableElastiCache: true,
  },
}
