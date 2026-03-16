# Round 8 Clarifications & Challenged Assumptions

## K8s Manifests: Dynamic Value Injection

The `k8s/` YAML files need values that only exist after CloudFormation deploys: ECR image URLs, RDS Proxy/Aurora endpoints, Secrets Manager secret ARNs, and IRSA role ARNs. These can't be hardcoded in static YAML.

Three practical options:

- **`envsubst`** — YAML files contain `${PLACEHOLDER}` tokens. The deploy workflow queries CloudFormation for the values, sets them as shell env vars, then pipes each file through `envsubst | kubectl apply`. Simple, no extra tools.
- **Kustomize** — A `kustomization.yaml` at `k8s/` defines overlays and value patches. Native to `kubectl`, no Helm needed, slightly more structured.
- **Helm charts** — Convert `k8s/` into Helm templates. Most powerful but overkill since Helm is already used only for cluster infrastructure (ESO, ALB Controller, Fluent Bit).

`envsubst` is the simplest for a PoC. Kustomize is cleaner but adds indirection. Which do you prefer?

A: envsubst

---

## Docker Image Tag Strategy

When the deploy workflow builds and pushes images to ECR, it needs a tag. The K8s Deployment manifests reference the image tag. Two options:

- **Git SHA** — Tag with the short commit SHA (e.g., `abc1234`). The deploy workflow substitutes the SHA into the K8s manifests before applying. Enables traceability and allows rollback. Kubernetes uses `imagePullPolicy: IfNotPresent` so re-deploys require a new SHA to pull updated images.
- **`latest`** — Simple, but Kubernetes won't re-pull on redeploy unless `imagePullPolicy: Always` is set. Less traceable.

Git SHA with `imagePullPolicy: IfNotPresent` is the recommended approach. Is that acceptable?

A: Git SHA is fine

---

## Integration Test Location

The Vitest integration tests (HTTP calls to both NestJS apps) don't belong to either app individually. Where should they live?

- **New package `packages/integration-tests`** — dedicated workspace package, own `package.json`, Vitest config
- **Inside `packages/load-tests`** — co-located with Artillery config since both are about testing the running apps from outside

Note: `packages/load-tests` already has a separate purpose (Artillery load testing + CloudWatch polling). Merging integration tests there could blur responsibilities.

Which do you prefer?

A: A new package - packages/integration-tests

---

## Health Check Endpoint

The NestJS apps need a `GET /health` endpoint for:
1. **Kubernetes readiness/liveness probes** — without these, EKS doesn't know when pods are ready to receive traffic, and the ALB won't mark targets as healthy
2. **Docker Compose health checks** — the CI workflow needs to wait for both apps to be ready before running integration tests; without health checks, the test may hit the app before it's fully started

The standard NestJS approach is `@nestjs/terminus` which exposes `GET /health` returning `{ status: 'ok' }`. This endpoint would live in both NestJS apps (since it's in the app, not the shared `db-query` package).

Should `GET /health` be added to both apps using `@nestjs/terminus`?

A: Yes

---

## CI Workflow: Proposed Step Sequence

Based on all decisions so far, the full `ci.yml` workflow would:

1. `pnpm install`
2. Run unit tests: `pnpm --filter @pooling-poc/db-query test`
3. Build Docker images for pooled-app and unpooled-app
4. `docker compose up -d`
5. Poll `GET /health` on both apps until ready (or timeout)
6. Run integration tests (Vitest HTTP calls to both apps)
7. `docker compose down` (runs even if step 6 fails)
8. Fail the build if step 2 or 6 failed

Is this sequence correct and complete?

A: Yes

---

## Clarification: `X-Test-Type` Header in Integration Tests

The integration tests call `GET /processlist` on both apps. Should the integration tests send the `X-Test-Type` header (e.g., `X-Test-Type: integration`)?

- **Yes** — the service always expects it; omitting it means `testType` would be `undefined` in the log entry, which may cause unexpected behaviour in the service or logging
- **No** — `testType` is optional in the integration test context; the app handles a missing header gracefully (e.g., defaults to `unknown`)

Related: should the service treat a missing `X-Test-Type` header as an error (400), or silently default to a fallback value like `unknown`?

A: Yes, the service should treat a missing X-Test-Type header as an error (400)
