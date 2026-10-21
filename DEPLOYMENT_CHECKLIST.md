# Deployment Checklist

Use this checklist for every deployment. Do not skip steps.

## Pre-Deployment

- [ ] All changes merged to `main` and CI is green
- [ ] Version/tag decided and changelog updated
- [ ] Required secrets and environment variables are configured
- [ ] Confirm `MIGRATION_POLICY: strict` is set in `render.yaml` so production
      deploys fail fast on pending migrations instead of starting in `warn` mode

## Testnet Deployment

- [ ] Push (or merge) to `main` to trigger the `deploy-testnet` workflow
- [ ] **Manual approval required:** the `deploy-testnet` workflow is gated by the
      `testnet` GitHub environment. A required reviewer must approve the run in
      the Actions UI before any deploy steps execute.
- [ ] Confirm the approval prompt appears and approve it (Actions → the running
      workflow → *Review deployments* → select `testnet` → *Approve and deploy*)
- [ ] Verify the deploy steps run only after approval
- [ ] Configure `TESTNET_API_URL` in **Settings → Secrets and variables → Actions** (or under the `testnet` environment secrets) pointing to the deployed testnet API base URL so the post-deploy `/health` verification step can confirm `200 OK` and `status: "up"`
- [ ] Smoke-test the integration environment after the deploy completes

> The `testnet` environment must exist in **Settings → Environments** with at
> least one required reviewer configured, and `TESTNET_API_URL` must be set as a
> required repository secret. Without them, the approval gate or post-deploy
> health check will fail.

## Post-Deployment

- [ ] Verify the deployed version/commit matches the intended release
- [ ] Monitor logs and metrics for errors
- [ ] Notify the team that the deployment is complete
