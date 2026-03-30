# Stewardly Phase 0 — AWS Deployment Guide

This guide walks you through deploying the complete Stewardly infrastructure on AWS from scratch.

---

## Prerequisites

Ensure you have the following installed:

```bash
node --version    # v20.x or higher
aws --version     # AWS CLI v2
npx cdk --version # CDK v2.148 or higher
git --version
```

Install CDK CLI globally if needed:
```bash
npm install -g aws-cdk
```

---

## Step 1: AWS Account Setup

### 1.1 Create AWS Account
Go to https://aws.amazon.com and create an account if you don't have one.

### 1.2 Enable MFA on Root Account
- Sign in as root → My Security Credentials → Enable MFA
- Use a TOTP authenticator app (Authy, 1Password, etc.)

### 1.3 Create IAM User for Deployment
```bash
# Via AWS Console: IAM → Users → Create User
# Username: stewardly-deploy
# Attach policy: AdministratorAccess (narrow down permissions post-launch)
# Create access key for CLI
```

### 1.4 Configure AWS CLI
```bash
aws configure
# AWS Access Key ID: [your key]
# AWS Secret Access Key: [your secret]
# Default region name: us-east-1
# Default output format: json
```

### 1.5 Verify Identity
```bash
aws sts get-caller-identity
# Should return your account ID and user ARN
```

---

## Step 2: Bootstrap CDK

CDK bootstrap creates an S3 bucket and ECR repo needed for CDK assets.

```bash
cd infra
npm install

# Get your account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1

npx cdk bootstrap aws://${ACCOUNT_ID}/${REGION}
```

Expected output:
```
✅  Environment aws://123456789012/us-east-1 bootstrapped.
```

---

## Step 3: Deploy Infrastructure Stacks

```bash
cd infra

# Deploy all stacks (dev stage)
npx cdk deploy --all --context stage=dev --require-approval never --outputs-file cdk-outputs.json
```

This deploys 5 stacks in order:
1. `StewardlyNetwork-dev` — VPC, subnets, security groups
2. `StewardlyStorage-dev` — S3 documents bucket
3. `StewardlyDatabase-dev` — Aurora Serverless v2 PostgreSQL
4. `StewardlyAuth-dev` — Cognito User Pool
5. `StewardlyApi-dev` — API Gateway + Lambda functions

**Expected deployment time: 15–25 minutes** (Aurora takes the longest)

After deployment, save these values from `cdk-outputs.json`:
```json
{
  "StewardlyApi-dev": {
    "ApiUrl": "https://XXXX.execute-api.us-east-1.amazonaws.com"
  },
  "StewardlyAuth-dev": {
    "UserPoolId": "us-east-1_XXXXXXXXX",
    "UserPoolClientId": "XXXXXXXXXXXXXXXXXXXXXXXXXX"
  }
}
```

---

## Step 4: Configure GitHub Secrets

### 4.1 Set Up AWS OIDC Trust (Recommended — No Long-Lived Keys)

Create an IAM OIDC provider for GitHub Actions:

```bash
# Create the OIDC provider
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Create an IAM role with this trust policy (save as `github-trust-policy.json`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_ORG/stewardly:*"
        }
      }
    }
  ]
}
```

```bash
# Replace ACCOUNT_ID and YOUR_GITHUB_ORG in the file, then:
aws iam create-role \
  --role-name StewardlyGitHubActionsRole \
  --assume-role-policy-document file://github-trust-policy.json

aws iam attach-role-policy \
  --role-name StewardlyGitHubActionsRole \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# Get the role ARN
aws iam get-role --role-name StewardlyGitHubActionsRole --query Role.Arn --output text
```

### 4.2 Add GitHub Secrets

In your GitHub repository: Settings → Secrets → Actions → New repository secret

| Secret Name | Value |
|-------------|-------|
| `AWS_ROLE_ARN` | arn:aws:iam::ACCOUNT_ID:role/StewardlyGitHubActionsRole |
| `AWS_REGION` | us-east-1 |
| `VERCEL_TOKEN` | From vercel.com → Account Settings → Tokens |
| `VERCEL_ORG_ID` | From vercel.com → Settings |
| `VERCEL_PROJECT_ID` | From your Vercel project settings |

---

## Step 5: Run Database Migrations

```bash
# Invoke the migration Lambda directly
aws lambda invoke \
  --function-name stewardly-migration-dev \
  --payload '{"action": "migrate"}' \
  --cli-binary-format raw-in-base64-out \
  /tmp/migration-result.json

cat /tmp/migration-result.json
```

The migration Lambda applies SQL files from `db/migrations/` in version order.

To run seed data (dev only):
```bash
aws lambda invoke \
  --function-name stewardly-migration-dev \
  --payload '{"action": "seed"}' \
  --cli-binary-format raw-in-base64-out \
  /tmp/seed-result.json
```

**Alternatively**, connect directly via psql through the RDS Data API console or a bastion host to run the SQL files manually.

---

## Step 6: Create First Admin User

```bash
USER_POOL_ID=us-east-1_XXXXXXXXX  # From Step 3 outputs
ADMIN_EMAIL=admin@yourhoaname.com

# Create the user
aws cognito-idp admin-create-user \
  --user-pool-id ${USER_POOL_ID} \
  --username ${ADMIN_EMAIL} \
  --temporary-password "TempPass123!" \
  --user-attributes \
    Name=email,Value=${ADMIN_EMAIL} \
    Name=email_verified,Value=true \
    Name=given_name,Value=Admin \
    Name=family_name,Value=User

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id ${USER_POOL_ID} \
  --username ${ADMIN_EMAIL} \
  --password "YourSecurePassword123!" \
  --permanent

# Set HOA ID and role (get HOA ID from database after seed or create via API)
aws cognito-idp admin-update-user-attributes \
  --user-pool-id ${USER_POOL_ID} \
  --username ${ADMIN_EMAIL} \
  --user-attributes \
    "Name=custom:hoaId,Value=YOUR_HOA_UUID" \
    "Name=custom:role,Value=board_admin"
```

---

## Step 7: Configure Frontend Environment

Create `app/.env.local` with values from Step 3:

```bash
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_API_URL=https://XXXX.execute-api.us-east-1.amazonaws.com
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_AWS_REGION=us-east-1
```

---

## Step 8: Run Locally Against Real AWS

```bash
cd app
npm install
# Ensure .env.local is configured (Step 7)
npm run dev
```

Open http://localhost:3000 and sign in with the admin credentials from Step 6.

---

## Step 9: Deploy Frontend to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# From the app/ directory
cd app
vercel

# Follow prompts:
# - Link to existing project or create new
# - Set root directory to: ./  (you're already in app/)
# - Override build command: no
# - Override output directory: no
```

Set environment variables in Vercel Dashboard → Project → Settings → Environment Variables:
- All `NEXT_PUBLIC_*` variables from Step 7
- Set `NEXT_PUBLIC_USE_MOCK=false`

---

## Step 10: Verify Everything Works

```bash
API_URL=https://XXXX.execute-api.us-east-1.amazonaws.com

# Health check
curl ${API_URL}/health
# Expected: {"status":"ok","stage":"dev","timestamp":"..."}

# Auth check (should return 401)
curl ${API_URL}/api/dashboard
# Expected: {"error":"Unauthorized","message":"Authentication required"}
```

**Full verification checklist:**
- [ ] `curl ${API_URL}/health` returns `{"status":"ok",...}`
- [ ] Can navigate to your Vercel URL without 404
- [ ] Can sign in with admin credentials
- [ ] Dashboard loads with real data (or "0" values if no data yet)
- [ ] Can create a task (Tasks page → New Task)
- [ ] Can schedule a meeting (Meetings page → Schedule Meeting)
- [ ] Signing in as homeowner shows limited finances view

---

## Troubleshooting

### Lambda cold start timeout
Aurora Serverless v2 cold starts can take 10-15 seconds. First requests may time out.
- **Fix**: Increase Lambda timeout to 30s (already configured in `SecureLambda` construct)
- **Fix**: Set `auroraMinAcu: 1` instead of 0.5 to keep Aurora warm (higher cost)

### Cognito "Invalid token" errors
- Check that `NEXT_PUBLIC_COGNITO_USER_POOL_ID` and `NEXT_PUBLIC_COGNITO_CLIENT_ID` are correct
- Verify the Amplify configuration in `app/src/lib/amplify.ts`
- Ensure the user has `custom:hoaId` attribute set

### CORS issues
- The API Gateway CORS configuration allows all origins in dev
- If you see CORS errors, check the API Gateway stage and route configuration
- The Lambda response headers include `Access-Control-Allow-Origin: *`

### Aurora Data API "not enabled" error
- Verify `enableDataApi: true` in the DatabaseStack
- Check IAM permissions: Lambda role needs `rds-data:ExecuteStatement`
- The cluster must be in AVAILABLE state (check RDS console)

### CDK "Resource already exists" error
- Run `npx cdk diff` to see what changed
- For KMS key conflicts, the key may need to be manually deleted in AWS console
- Use `--context stage=dev` consistently

### Deployment stuck on "Waiting for Lambda"
This is normal — CDK waits for Lambda functions to be ready.
If stuck > 5 minutes, check CloudWatch Logs for the Lambda.

---

## Cost Monitoring

Set up a billing alert to avoid surprises:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "StewardlyMonthlyBudget" \
  --alarm-description "Alert when monthly AWS spend exceeds $50" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --threshold 50 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT_ID:billing-alerts \
  --dimensions Name=Currency,Value=USD
```

Or via AWS Console: Billing → Budgets → Create Budget → set $50/month.

**Estimated dev costs:**
| Service | Monthly Estimate |
|---------|-----------------|
| Aurora Serverless v2 (0.5 ACU min) | $5–15 |
| Lambda (low traffic) | < $1 |
| API Gateway HTTP | < $1 |
| S3 | < $1 |
| NAT Gateway | $15–20 |
| **Total** | **~$25–40/month** |

To minimize costs in dev:
- Set `auroraMinAcu: 0` (cold starts but free when idle)
- Use 1 NAT Gateway (already configured for dev)
- Delete the stack when not in use: `npx cdk destroy --all`

---

## Updating Infrastructure

After code changes:
```bash
cd infra
npx cdk diff --context stage=dev    # Preview changes
npx cdk deploy --all --context stage=dev --require-approval never
```

For database schema changes:
1. Add a new migration file: `db/migrations/V003__your_change.sql`
2. Invoke the migration Lambda again (Step 5)
