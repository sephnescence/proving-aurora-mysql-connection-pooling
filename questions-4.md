# Round 4 Clarifications & Challenged Assumptions

## RDS Proxy: Your Counter-Challenge is Valid

RDS Proxy is a real AWS-managed connection pooler that sits between your application and Aurora. It maintains a pool of persistent connections to the database and multiplexes application connections through them. This is genuine server-side pooling.

With RDS Proxy as the architecture:
- The **pooled stack**: NestJS → RDS Proxy endpoint → Aurora Serverless v2. The proxy holds open a pool of connections to Aurora and reuses them across NestJS requests.
- The **unpooled stack**: NestJS → Aurora cluster endpoint directly. Each request opens and closes a new connection.

Both NestJS apps would use `mysql2` with a plain single connection (no client-side pool). The pooling difference is entirely at the infrastructure level, visible in the PROCESSLIST output.

RDS Proxy supports Aurora Serverless v2. Additional cost is ~$0.015/hr.

- **Is this the architecture you want?** If yes, the MySQL client library question is resolved: mysql2, single connection, no client-side pool on either app.

A: Yes this is perfect!

- If no, the alternative is client-side pooling in NestJS (mysql2 pool on the pooled app, single connection on the unpooled app), with both apps connecting directly to Aurora.

A: N/A

---

## Challenge: Four Separate Log Groups Won't Work for EKS

You said you expected "separate log groups for each test type." This is architecturally incompatible with how EKS logging works.

EKS pods write logs to stdout/stderr. Fluent Bit (or the CloudWatch agent) forwards those logs to CloudWatch. Log groups are determined by the **pod/namespace configuration at deploy time** — there is no mechanism for a running pod to dynamically switch which log group it writes to based on request content.

Creating four log groups (pooled-sequential, pooled-concurrent, unpooled-sequential, unpooled-concurrent) would require each NestJS request to make a direct AWS SDK call to CloudWatch Logs to write to a different group per request. This adds latency to every request, significantly complicates the NestJS code, and defeats the purpose of the standard EKS log pipeline.

The standard pattern is:
- **2 log groups** (one per NestJS app: pooled and unpooled)
- Each log entry includes a `testType` field (`sequential` or `concurrent`)
- The four Logs Insights widgets each filter by `testType` within the relevant log group

This achieves the same dashboard layout you described. Is this acceptable?

A: Yes this is perfect!

---

## VPC Option C: Confirming the Topology

Based on your choice, the topology would be:

- **VPC A**: EKS cluster (both NestJS deployments) + pooled Aurora Serverless v2 (+ RDS Proxy if chosen)
- **VPC B**: Unpooled Aurora Serverless v2 only
- **VPC peering** between VPC A and VPC B, allowing the unpooled NestJS app (which runs in EKS in VPC A) to reach Aurora in VPC B

Both NestJS apps run on the **same EKS cluster** in VPC A. Only the database connectivity differs. Is this interpretation correct?

A: Yes

---

## Artillery IAM Role: Where is it Defined?

The Artillery GitHub workflow needs its own IAM role (separate from the deploy role). This role's trust policy must reference the GitHub OIDC provider — which is created in the bootstrap stack.

Two options for where to define the Artillery role:

- **Option A:** Bootstrap stack — alongside the deploy role and OIDC provider. Both IAM roles are created once manually.
- **Option B:** Main CloudFormation stack — created during deploy. The role trust policy would reference the GitHub OIDC provider ARN (which is deterministic: `arn:aws:iam::{AccountId}:oidc-provider/token.actions.githubusercontent.com`).

Option A keeps all IAM roles together. Option B means the Artillery role doesn't exist until after the first deploy. Which do you prefer?

A: Option B

---

## EKS IRSA for External Secrets Operator

ESO needs to call AWS Secrets Manager. In EKS, this is done via **IRSA (IAM Roles for Service Accounts)**:

1. EKS creates its own OIDC provider (separate from the GitHub one — this is for pod-level AWS identity).
2. An IAM role is created that trusts the EKS OIDC provider, scoped to ESO's service account.
3. ESO's Kubernetes service account is annotated with the IAM role ARN.

Steps 1 and 2 go in the CloudFormation stack. Step 3 is handled by the Helm install in the workflow.

This is not a question — just confirming you're aware this is an additional IAM role in the stack (separate from the deploy role and Artillery role). The CloudFormation stack will create it automatically.

A: Acknowledged

---

## NestJS Route Structure: Full Path or Prefix Stripped by ALB?

The ALB routes `/pooled/*` to the pooled NestJS service and `/unpooled/*` to the unpooled service. There are two ways to handle the path prefix:

- **Option A:** ALB strips the prefix before forwarding. NestJS apps both expose `GET /processlist`. The ALB rewrites `/pooled/processlist` → `/processlist` before hitting the pod.
- **Option B:** ALB forwards the full path. NestJS apps expose `GET /pooled/processlist` and `GET /unpooled/processlist` respectively, matching the full path.

Option A means both NestJS apps are identical in their routing code. Option B means they differ only in their route prefix. Which do you prefer?

A: Option A

---

## Docker Compose Integration Test: Execution Flow

The CI workflow needs to bring up Docker Compose services before Vitest can run. Confirming the expected flow:

1. `docker compose up -d` (starts MySQL + both NestJS apps)
2. Wait for health checks to pass
3. Run Vitest integration tests (HTTP calls to the NestJS apps)
4. `docker compose down`
5. Fail the build if step 3 has failures

Is this correct? And specifically: are the integration tests making **HTTP calls to the NestJS apps**, or calling the shared package's service directly without the HTTP layer?

A: I'm only testing that the database query works

---

## Artillery Package: Still a pnpm Workspace Package?

The original plan had Artillery as a dedicated package. Now that deployment is handled by GitHub Actions workflows, what remains in the Artillery package is:

- Artillery YAML config files (`sequential.yml`, `concurrent.yml`)
- A Node.js/TypeScript script that polls CloudWatch Logs Insights after tests complete and prints results
- A `package.json` listing Artillery as a dependency

This still makes sense as a workspace package. The GitHub Actions workflows install it and invoke it. Does this match what you want, or should Artillery config just live alongside the workflow files without a dedicated package?

A: Yes. Still a pnpm workspace package

---

## pnpm Workspace: Package Names

The structure hasn't been named. Proposed package names — please confirm or correct:

| Directory | Purpose |
|---|---|
| `packages/db-query` | Shared NestJS Module + injectable Service |
| `apps/pooled-app` | NestJS app, connects via RDS Proxy (or NestJS pool) |
| `apps/unpooled-app` | NestJS app, connects directly to Aurora |
| `packages/load-tests` | Artillery config + CloudWatch polling script |

---

## GitHub Workflows: Confirming the Full List

Based on all answers so far, the expected workflows are:

| File | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Push / PR | Unit tests + Docker Compose integration tests (blocking) |
| `deploy.yml` | Manual | Deploy CloudFormation, Helm charts, K8s resources |
| `teardown.yml` | Manual | Tear down the stack |
| `artillery-sequential.yml` | Manual | 3 VU × 5 req test, poll CloudWatch 5 min |
| `artillery-concurrent.yml` | Manual | 15 VU × 1 req test, poll CloudWatch 5 min |

The **bootstrap** is a CloudFormation file deployed manually via CLI — not a GitHub Actions workflow. Is this list complete and correct?

A: Yes

---

## Aurora DB Credentials: Auto-Generated or You Provide Them?

Aurora Serverless v2 in CloudFormation requires a master username and password. Options:

- **Option A:** CloudFormation auto-generates the password and stores it in Secrets Manager (`ManageMasterUserPassword: true`). No password is ever visible or stored elsewhere.
- **Option B:** You provide the password as a CloudFormation parameter at deploy time (it gets stored in Secrets Manager by the stack).

Option A is more secure and requires no manual input. Option B gives you a known password. Which do you prefer?

A: Option A
