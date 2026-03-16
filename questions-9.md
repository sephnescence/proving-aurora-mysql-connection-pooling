# Round 9 Clarifications & Challenged Assumptions

## Critical: The Unpooled App Needs Per-Request Connections to Prove Anything

This is the most important remaining design decision. If the unpooled NestJS app maintains a **single persistent connection** to Aurora (as a long-running server naturally would), PROCESSLIST will always show exactly 1 connection — regardless of load. This makes the comparison with RDS Proxy uninteresting.

For the PoC to be meaningful:
- **Pooled app**: maintains a persistent connection to **RDS Proxy**, which pools connections to Aurora on your behalf. Under load, the proxy manages multiple Aurora connections internally.
- **Unpooled app**: opens a **new connection per request** to Aurora, then closes it. Under the 15-concurrent test, you'd see up to 15 simultaneous connections in PROCESSLIST, demonstrating what happens without pooling.

This means the `@pooling-poc/db-query` shared module needs to support **two connection strategies**, configurable per app:

- `DB_CONNECTION_MODE=persistent` — single long-lived connection (used by pooled app, connecting to RDS Proxy)
- `DB_CONNECTION_MODE=per-request` — new connection created and destroyed per call (used by unpooled app, connecting to Aurora directly)

Without this distinction, both apps will show 1 connection in PROCESSLIST at any point in time, and there will be nothing meaningful to compare.

Is this the correct interpretation of what you want to prove? And is the `DB_CONNECTION_MODE` env var approach acceptable?

A: DB_CONNECTION_MODE is acceptable. As for a meaningful poc, I believe you've got the right idea. 

---

## Docker Base Image

The Docker health check in Docker Compose (and Kubernetes liveness/readiness probes) needs to call `GET /health`. For Docker Compose, this is typically done with `curl` or `wget` inside the container.

Standard Node.js base images (`node:22-slim`, `node:22-alpine`) do not include `curl` or `wget` by default. Options:

- **`node:22-slim`** and install `curl` via `apt-get` in the Dockerfile — adds ~3MB, familiar tooling
- **`node:22-alpine`** and use `wget` (available in Alpine by default) — smaller image overall
- **Node.js built-in fetch** — use `node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1))"` as the health check command — no extra dependencies

The Node fetch approach is cleanest since it requires no extra packages. Kubernetes probes use `httpGet` natively so they don't need curl at all. Docker Compose health checks would use the Node fetch command.

Which approach do you prefer?

A: Use node:22-alpine and wget. As much as possible, avoid code getting eval'd

---

## CI Workflow: Branch Trigger

`ci.yml` runs unit tests and integration tests. Should it trigger on:

- **All branches** — catches issues on feature branches before merge
- **`main` only** — leaner, runs only on the protected branch
- **Push to any branch + PRs targeting `main`** — standard open source pattern

Which do you want?

A: All branches, and workflow_dispatch. Additionally, please create a github workflow that runs every 24 hours at noon (Brisbane time), and arbitrarily runs the unit and integration tests

---

## Integration Test HTTP Client

The `packages/integration-tests` Vitest tests need an HTTP client to call `GET /processlist` on both local NestJS apps.

- **Native `fetch`** — built into Node 22, zero dependencies
- **`axios`** — more ergonomic for assertions, extra dependency

Since Node 22 has `fetch` built in and the tests are straightforward, native `fetch` is sufficient. Is that acceptable?

A: fetch is sufficient

---

## Final Package Table

Confirming the complete pnpm workspace structure based on all decisions:

| Directory | Package name | Purpose |
|---|---|---|
| `packages/db-query` | `@pooling-poc/db-query` | Shared NestJS Module + Service + Vitest unit tests |
| `packages/integration-tests` | `@pooling-poc/integration-tests` | Vitest HTTP integration tests (runs against Docker Compose) |
| `packages/load-tests` | `@pooling-poc/load-tests` | Artillery YAML configs + CloudWatch polling script |
| `apps/pooled-app` | `@pooling-poc/pooled-app` | NestJS app — connects via RDS Proxy, `DB_CONNECTION_MODE=persistent` |
| `apps/unpooled-app` | `@pooling-poc/unpooled-app` | NestJS app — connects directly to Aurora, `DB_CONNECTION_MODE=per-request` |

A: Looks great to me
