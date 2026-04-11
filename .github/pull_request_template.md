## What changed
<!-- One-paragraph summary of the change and why it was needed -->

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Infrastructure / deployment
- [ ] Documentation

## Testing
- [ ] Tested locally in mock mode (`NEXT_PUBLIC_USE_MOCK=true`)
- [ ] Lambda changes tested with unit tests or local invocation
- [ ] CDK changes validated with `cdk synth` (no diff errors)
- [ ] New environment variables documented in `.env.example`

## Checklist
- [ ] No secrets or credentials committed
- [ ] New Lambda code placed under `src/` within the service directory
- [ ] Multi-tenant isolation preserved — `hoaId` never sourced from request body
- [ ] PII fields (email, phone) not logged — only IDs
- [ ] `DEPLOYMENT.md` updated if deployment steps changed
