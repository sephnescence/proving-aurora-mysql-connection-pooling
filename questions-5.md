# Round 5 Clarifications & Challenged Assumptions

## Integration Test: HTTP Layer or Service Layer?

"I'm only testing that the database query works" is ambiguous. There are two interpretations:

- **Option A — Service layer (no HTTP):** The Vitest test imports the `db-query` NestJS module directly, spins up a NestJS `TestingModule`, and calls the service method against the MySQL container. Docker Compose only needs MySQL. The NestJS HTTP layer, controllers, and both apps are **not tested at all** in CI.
- **Option B — HTTP layer:** The Vitest test makes an HTTP call to `GET /processlist` on both NestJS apps running in Docker Compose, and asserts the response contains valid process list data. Docker Compose needs MySQL + both NestJS apps.

Option A tests the query in isolation. Option B verifies the full request path works (controller → service → database → response). Given this is a blocking CI step, Option B provides more coverage. Which do you want?

A: Sure, go with option B

---

## testType: How Does the NestJS App Know Which Test is Running?

The ALB strips the path prefix (Option A was selected), so both NestJS apps receive `GET /processlist` with no test type information in the URL. To log the `testType` field, the app needs the caller to pass it in. The two standard options are:

- **Header:** `X-Test-Type: sequential` — Artillery sets this header in its config. Cleaner for the NestJS code (no query string parsing needed).
- **Query param:** `GET /processlist?testType=sequential` — more visible in logs but requires query string parsing.

Which do you prefer? (Artillery can set either easily in its YAML config.)

A: Header

---

## Package Names: No Answer Provided

The proposed workspace structure received no answer. Please confirm or correct:

| Directory | Package name | Purpose |
|---|---|---|
| `packages/db-query` | `@pooling-poc/db-query` | Shared NestJS Module + injectable Service |
| `apps/pooled-app` | `@pooling-poc/pooled-app` | NestJS app — connects via RDS Proxy |
| `apps/unpooled-app` | `@pooling-poc/unpooled-app` | NestJS app — connects directly to Aurora |
| `packages/load-tests` | `@pooling-poc/load-tests` | Artillery config + CloudWatch polling script |

A: That's perfect

---

## Teardown Workflow: What Gets Torn Down?

The teardown workflow tears down the main CloudFormation stack. But ECR repositories are in the **bootstrap stack**, and CloudFormation cannot delete an ECR repo that contains images — it will fail. A complete teardown would need to either:

- Empty the ECR repos before deleting the bootstrap stack (the teardown workflow would need to do this), or
- Leave the bootstrap stack (OIDC provider, IAM roles, ECR repos) in place permanently and only tear down the main stack.

Leaving the bootstrap stack in place is the safer default (re-deploying later still works). Tearing it down removes all IAM roles and requires re-running the bootstrap before the next deploy.

- Should the teardown workflow destroy **main stack only**, or **main stack + bootstrap stack** (with ECR image cleanup)?

A: Tear down both, but make them separate github workflows. I won't be tearing down the bootstrap stack that often.

---

## CloudFormation Stack Name

The deploy and teardown workflows need a stack name to reference. Should this be hardcoded in the workflows (e.g., `aurora-pooling-poc`) or passed as a workflow input parameter so you can run multiple instances?

A: Hardcode it

---

## Artillery Option B Consequence: First-Run Limitation

The Artillery IAM role is in the main CloudFormation stack (Option B). This means the Artillery workflows **cannot run until after the first successful deploy**. The first time you run them, the role will already exist. There is no issue after that first deploy.

Just confirming: you're aware Artillery workflows can't be run before at least one successful deploy?

A: Acknowledged

---

## RDS Proxy Pool Settings

RDS Proxy has two relevant settings that affect what you'll see in PROCESSLIST:

- `MaxConnectionsPercent` — percentage of the Aurora max connections that the proxy can use for its pool. Default: 100%.
- `MaxIdleConnectionsPercent` — percentage of `MaxConnectionsPercent` the proxy keeps open when idle. Default: 50%.

For Aurora Serverless v2 with 1 ACU, max connections is ~90. At defaults, the proxy can hold up to 90 connections and will keep ~45 open at idle (even before any requests arrive).

- Should defaults be used, or would you like to tune these to make the PROCESSLIST comparison more dramatic (e.g., a low `MaxConnectionsPercent` to cap the pool size)?

A: Defaults are fine

---

## MySQL Version Alignment

Aurora MySQL 3.x is compatible with MySQL 8.0. The Docker Compose MySQL container should match. Using MySQL 8.0 for Docker Compose ensures the `information_schema.processlist` query behaves identically locally and in Aurora.

- Is MySQL 8.0 acceptable for the Docker Compose container, or do you have a preference?

A: MySQL 8.0 is fine

---

## Versions: NestJS, Node.js, EKS

Not yet specified. Proposed defaults — confirm or correct:

| Component | Proposed version |
|---|---|
| NestJS | v11 (latest stable) |
| Node.js | 22 LTS |
| EKS Kubernetes | 1.32 (latest stable as of early 2026) |

A: This is correct

---

## VPC CIDR Ranges

VPC peering requires non-overlapping CIDR blocks. Proposed defaults — confirm or correct:

| VPC | CIDR | Contents |
|---|---|---|
| VPC A | `10.0.0.0/16` | EKS + pooled Aurora + RDS Proxy |
| VPC B | `10.1.0.0/16` | Unpooled Aurora |

A: This is correct

---

## Artillery CloudWatch Output: What Gets Printed?

After Artillery finishes, the polling script queries CloudWatch Logs Insights against both log groups and prints results for 5 minutes. What should the console output contain?

- Raw log entries from both log groups for the test run (filtered by `testType`)?
- A summary showing the number of connections visible in PROCESSLIST per request?
- Both?

A: Let's go with both
