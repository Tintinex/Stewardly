# Stewardly — HOA Management SaaS

Modern HOA management software for community boards and homeowners. Stewardly streamlines dues collection, meeting management, task tracking, and resident communications.

## Repository Structure

```
stewardly/
├── index.html              # Marketing website (do not modify)
├── app/                    # Next.js 14 frontend application
│   ├── src/
│   │   ├── app/            # App Router pages
│   │   │   ├── auth/       # Sign in / Sign up
│   │   │   └── dashboard/  # Protected app pages
│   │   ├── components/     # UI and layout components
│   │   ├── contexts/       # React contexts (Auth)
│   │   ├── lib/            # API client, config, mock data
│   │   └── types/          # TypeScript interfaces
│   └── package.json
├── infra/                  # AWS CDK v2 infrastructure
│   ├── bin/app.ts          # CDK app entry point
│   └── lib/
│       ├── stacks/         # VPC, Database, Auth, API stacks
│       └── constructs/     # Reusable Lambda construct
├── services/               # Lambda function handlers (TypeScript)
│   ├── shared/             # DB client, authorizer, response helpers
│   ├── tasks-service/
│   ├── meetings-service/
│   ├── residents-service/
│   ├── messaging-service/
│   ├── finances-service/
│   └── dashboard-service/
├── db/
│   └── migrations/         # PostgreSQL migration SQL files
└── .github/workflows/      # CI/CD GitHub Actions
```

## Quick Start — Mock Mode (No AWS Required)

The fastest way to run Stewardly locally is with mock mode enabled. All data is served from `app/src/lib/mock-data.ts` with simulated network delays.

```bash
cd app
npm install
cp .env.example .env.local
# .env.local already has NEXT_PUBLIC_USE_MOCK=true
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be automatically signed in as Sarah Chen (Board Admin) for Maple Ridge HOA.

### Mock Data Includes

- **HOA**: Maple Ridge HOA, 24 units, Raleigh NC
- **Residents**: 8 residents (1 board admin, 2 board members, 5 homeowners)
- **Tasks**: 10 tasks across all statuses and priorities
- **Meetings**: 3 meetings (1 upcoming with agenda, 2 past with minutes)
- **Finances**: $143k annual budget, $182k reserve fund, 6 months expense data, connected bank accounts
- **Messages**: 3 boards (Community Wide, Board Only, Maintenance), 4 threads, 11 posts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS v3, Recharts |
| Auth | AWS Cognito via Amplify v6 |
| API | AWS API Gateway HTTP API (Lambda proxy) |
| Lambda | Node.js 20.x, TypeScript (esbuild) |
| Database | Aurora Serverless v2 PostgreSQL 15 (RDS Data API) |
| Infrastructure | AWS CDK v2 (TypeScript) |
| Storage | S3 (documents, encrypted) |
| CI/CD | GitHub Actions with AWS OIDC |

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full AWS deployment instructions.

**Quick summary:**
1. Set up AWS account and configure CDK
2. `cd infra && npm install && npx cdk deploy --all`
3. Configure GitHub secrets for CI/CD
4. Deploy frontend to Vercel

## Architecture

```
Browser → CloudFront / Vercel → Next.js App
                ↓
         API Gateway HTTP
                ↓
         Lambda Authorizer (validates Cognito JWT, extracts hoaId)
                ↓
    ┌─────────────────────────────┐
    │ Lambda Functions (per route) │
    │  tasks / meetings / residents│
    │  finances / messaging / dash │
    └─────────────────────────────┘
                ↓
    Aurora Serverless v2 (RDS Data API)
```

All Lambda functions extract `hoaId` exclusively from the JWT authorizer context — never from request body or query params — ensuring strict multi-tenant data isolation.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_USE_MOCK` | `true` for local dev without AWS |
| `NEXT_PUBLIC_API_URL` | API Gateway endpoint URL |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | Cognito App Client ID |
| `NEXT_PUBLIC_AWS_REGION` | AWS region (default: us-east-1) |

## License

Proprietary — All rights reserved.
