# Round 11 Clarifications & Challenged Assumptions

## Aurora Requires SSL — mysql2 Needs to Know

Aurora MySQL 3.x enables `require_secure_transport=ON` by default, which means **all connections must use SSL or they will be rejected**. mysql2 does not enable SSL by default. Without SSL configuration in the `db-query` service, connections to real Aurora will fail — even though local Docker Compose MySQL will work fine (SSL not required locally).

Options for handling SSL in mysql2:

- **`ssl: { rejectUnauthorized: false }`** — accepts any certificate without verification. Simple, works in a PoC, but technically insecure (vulnerable to MITM). For a private VPC with no external exposure, acceptable.
- **SSL enabled only when `DB_SSL=true`** — controlled by an env var. Local Docker Compose sets `DB_SSL=false`, production K8s sets `DB_SSL=true`. This keeps local development simple and production secure.
- **Always use the AWS RDS CA bundle** — ship the RDS CA cert in the Docker image, use it for verification. Most secure but adds image complexity.

For a PoC in a private VPC, `DB_SSL=true` with `rejectUnauthorized: false` is the pragmatic default. Is this acceptable?

A: Yes that's fine

---

## Health Check Depth: HTTP Only or DB Connectivity?

`@nestjs/terminus` `GET /health` can check two things:

- **HTTP only** — returns `{ status: 'ok' }` if the server is running. Simple. Kubernetes marks the pod ready as soon as NestJS starts, even if the DB connection hasn't been established yet.
- **HTTP + DB connectivity** — attempts a DB ping. Pod is only marked ready once NestJS has successfully connected to the DB. More accurate, but adds ~1-2 seconds to pod startup, and means the Kubernetes deployment hangs if the DB is temporarily unreachable during startup.

For Docker Compose: the "DB connectivity" check means the integration tests won't start until both apps have confirmed DB connections — safer for CI.

For EKS: the "DB connectivity" check means if Aurora is briefly unavailable, pods fail the readiness probe and the ALB stops routing traffic to them. This is actually correct behaviour for a DB-dependent app.

Which depth do you want?

A: DB connectivity

---

## Aurora Database Name

The Aurora CloudFormation resource requires a `DatabaseName` property — the default database created on the cluster. This doesn't affect the `information_schema.processlist` query (which works regardless of which DB you're connected to), but it's needed for the connection config.

Proposed: `pooling_poc` for both clusters.

Is this acceptable, or do you have a preference?

A: pooling_poc is fine

---

## `DB_SSL` Addition to Environment Variable List

If the SSL env var approach is chosen, the full env var list for `@pooling-poc/db-query` becomes:

| Variable | Local (Docker Compose) | Production (K8s) |
|---|---|---|
| `DB_HOST` | `mysql` | RDS Proxy or Aurora endpoint (from CF outputs) |
| `DB_PORT` | `3306` | `3306` |
| `DB_USER` | `admin` | `admin` (from Secrets Manager via ESO) |
| `DB_PASSWORD` | (from `.env`) | (from Secrets Manager via ESO) |
| `DB_NAME` | `pooling_poc` | `pooling_poc` |
| `DB_SSL` | `false` | `true` |
| `DB_CONNECTION_MODE` | `persistent` or `per-request` | `persistent` or `per-request` |
| `DATABASE_URL` | optional override | optional override |

No action needed — just confirming this is the complete variable set before implementation begins.

A: Acknowledged
