# Round 12 — Final Items Before Implementation

## Readiness Probe Interval: PROCESSLIST Noise

The `GET /health` endpoint runs a DB ping via `@nestjs/terminus`. Kubernetes readiness probes call this endpoint on an interval. The **default interval is 10 seconds**, which means in `per-request` mode the unpooled app opens and closes a health-check connection to Aurora every 10 seconds.

During Artillery tests (~15–30 seconds of load), this probe fires 1–3 times. Each probe creates an extra connection in PROCESSLIST that isn't from a real request — it's background noise in the data you're trying to analyse.

Proposed fix: set the readiness probe interval to **60 seconds** with an initial delay of **30 seconds**. This virtually eliminates probe-driven connections during short Artillery runs.

Is this acceptable, or do you want the default 10-second interval?

A: This is acceptable, but make the interval 10 minutes

---

## We Appear to Have Covered Everything

After a full review against all decisions across 12 rounds, I believe the design is complete. No further blocking questions remain. Here is a final inventory of every key decision made:

**Infrastructure**
- One EKS cluster (`aurora-pooling-poc-eks`, t3.small × 1, K8s 1.32) in VPC A (10.0.0.0/16)
- Pooled Aurora Serverless v2 + RDS Proxy in VPC A private subnets
- Unpooled Aurora Serverless v2 in VPC B (10.1.0.0/16), reached via VPC peering
- Both Aurora clusters: admin user, auto-generated password in Secrets Manager, DB name `pooling_poc`, MySQL 8.0 compatible
- One internet-facing ALB (ALB Controller), path prefix stripped before forwarding to pods
- CloudFormation stacks: `aurora-pooling-poc-bootstrap` (manual) + `aurora-pooling-poc` (via GitHub Actions)
- Region: ap-southeast-2

**Application**
- pnpm workspaces monorepo, 5 packages (see table below)
- NestJS v11, Node 22, node:22-alpine, wget health checks, git SHA image tags
- `@pooling-poc/db-query`: `processlist(testType)` + `ping()`, DB_CONNECTION_MODE=persistent|per-request, DB_SSL, nestjs-pino JSON logging
- `X-Test-Type` header required; missing header → 400
- `GET /health` checks HTTP + DB connectivity via `@nestjs/terminus`
- Kubernetes namespace: `pooling-poc`; K8s manifests in `k8s/` with `envsubst` placeholders

**Testing**
- Vitest unit tests in `db-query` (3 scenarios + logger verification)
- Vitest integration tests in `integration-tests` (HTTP, sends `X-Test-Type: integration`, 4 assertions)
- Artillery: sequential (3 VU × 5 req) + concurrent (15 VU × 1 req), both via GitHub Actions
- CloudWatch polling: every 30 seconds for 5 minutes, prints raw entries + avg rowCount per test type

**Workflows**
| File | Trigger |
|---|---|
| `ci.yml` | Push (all branches), `workflow_dispatch`, schedule `0 2 * * *` |
| `deploy.yml` | `workflow_dispatch` (main only) |
| `teardown.yml` | `workflow_dispatch` (main only) |
| `teardown-bootstrap.yml` | `workflow_dispatch` (main only) — guards against main stack existing |
| `artillery-sequential.yml` | `workflow_dispatch` (main only) |
| `artillery-concurrent.yml` | `workflow_dispatch` (main only) |

**Package table**
| Directory | Package name | Purpose |
|---|---|---|
| `packages/db-query` | `@pooling-poc/db-query` | Shared NestJS module, unit tests |
| `packages/integration-tests` | `@pooling-poc/integration-tests` | Vitest HTTP integration tests |
| `packages/load-tests` | `@pooling-poc/load-tests` | Artillery YAML + TypeScript CloudWatch polling script (tsx) |
| `apps/pooled-app` | `@pooling-poc/pooled-app` | NestJS — RDS Proxy, `DB_CONNECTION_MODE=persistent` |
| `apps/unpooled-app` | `@pooling-poc/unpooled-app` | NestJS — direct Aurora, `DB_CONNECTION_MODE=per-request` |

A: Acknowledged

---

## Proposed Next Step: Consolidated Design Document

Before writing any code, would you like a single `design.md` that consolidates all decisions from all 12 rounds into one readable reference document? This would serve as the source of truth during implementation and catch any final inconsistencies before a single line of code is written.

A: Yes please
