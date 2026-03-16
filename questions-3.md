# Round 3 Clarifications & Challenged Assumptions

## Contradiction: One Combined Stack vs VPC Per Stack

You answered "one combined stack" but also "a new VPC for each stack." These are now contradictory — there is only one stack, so "per stack" has no meaning.

If EKS lives in one VPC and each Aurora cluster lives in its own VPC, EKS needs to reach both Aurora VPCs. That requires **VPC peering** between the EKS VPC and each Aurora VPC — significant added complexity.

The practical options are:

- **Option A:** One VPC containing everything (EKS + both Aurora clusters). Isolation is enforced by security groups rather than network boundaries.
- **Option B:** Three VPCs — one for EKS, one per Aurora cluster — with VPC peering configured in the stack.
- **Option C:** Two VPCs — EKS + Aurora pooled in one, Aurora non-pooled in another — with peering for the second.

Which do you want?

A: Option C

---

## Challenge: Connection Pooling Lives in NestJS, Not Aurora

"One [Aurora cluster] will have a connection pool, and the other will not" — this is a misconception worth addressing. **Aurora clusters have no pooling setting.** Connection pooling is entirely client-side: it is configured in the NestJS application via the MySQL client library.

The two Aurora clusters are identical from a pooling perspective. What differs is how each NestJS app (pooled vs non-pooled) connects to its respective cluster. The reason to have two clusters is purely for **PROCESSLIST isolation** — so each app only sees its own connections in the output.

Confirming: you understand the pooling is in NestJS configuration, and the two clusters exist only to give each app its own isolated PROCESSLIST view?

A: Counter-challenge. What is the db proxy functionality in the aurora cluster? If I need provisioned databases to test, then so be it.

---

## OIDC Bootstrap: Chicken-and-Egg Problem

The GitHub Actions workflow needs an IAM role to deploy the CloudFormation stack. But that IAM role is created *by* a CloudFormation stack. You cannot use GitHub Actions to deploy the stack that creates the GitHub Actions IAM role — it has no credentials yet.

This requires a **separate bootstrap stack** (a small CloudFormation file creating just the OIDC provider + IAM role) that you deploy manually once via the AWS CLI or console, before any GitHub workflow runs.

- Is a separate bootstrap CloudFormation file (deployed manually once) acceptable?

A: Yes. I already told you that's what I wanted to do

- The bootstrap stack will need your GitHub repository slug (e.g. `sephnescence/proving-aurora-mysql-connection-pooling`) to scope the trust policy. Is that the correct repo?

A: Yes, that is the correct repo

---

## ECR Chicken-and-Egg Problem

The deploy workflow order you approved is: build images → push to ECR → deploy CloudFormation. But ECR repositories are provisioned *by* the CloudFormation stack. You can't push to an ECR repo that doesn't exist yet.

Resolution options:
- **Option A:** ECR repositories are provisioned in the bootstrap stack (deployed manually once), so they exist before the deploy workflow runs.
- **Option B:** The deploy workflow creates the ECR repositories as a separate CloudFormation stack first, then builds/pushes, then deploys the main stack.

Which do you prefer?

A: Option A

---

## ESO and AWS Load Balancer Controller Require Helm

Two Kubernetes components you need cannot be installed via CloudFormation natively:

1. **External Secrets Operator (ESO)** — pulls Secrets Manager credentials into Kubernetes.
2. **AWS Load Balancer Controller** — required to create an ALB from a Kubernetes Ingress resource.

Both are installed via Helm. The options are:
- Install them as steps in the **GitHub Actions deploy workflow** (after the CloudFormation stack is up but before app deployment).
- Use a **Lambda-backed CloudFormation custom resource** (complex, Lambda runs Helm commands).

The workflow approach is simpler. Is that acceptable, or do you need everything in CloudFormation?

A: The workflow approach sounds fine

---

## EKS Node Configuration

Not yet specified:
- What **EC2 instance type** for EKS nodes? Running two NestJS apps, ESO, and the Load Balancer Controller, `t3.small` (2 vCPU / 2 GB) is likely too tight. `t3.medium` (2 vCPU / 4 GB) is more appropriate.

A: You want a t3.medium for _fifteen_ connections? That seems excessive. If t3.small doesn't work, that will be revealed. I don't want to over-provision.

- How many nodes? A minimum of **2** is recommended for availability. 1 is cheaper but a single node failure takes everything down.

A: One node please. Don't over-provision

---

## Load Balancer: One ALB or Two?

The two NestJS services (pooled and non-pooled) need to be reachable by Artillery. Options:
- **One ALB** with two target groups on different paths (e.g. `/pooled/processlist` and `/unpooled/processlist`).
- **Two ALBs**, one per service, each with their own DNS.

Which do you prefer? And what should the endpoint path be — e.g. `GET /processlist`?

A: One ALB, so `GET /pooled/processlist` and `GET /unpooled/processlist` are the endpoints

---

## CloudWatch Dashboard: Distinguishing Test Types in Logs

You want four widgets: sequential and concurrent results for each stack. The Logs Insights widgets will need to **filter logs by test type**. That means the NestJS app (or Artillery) needs to include some identifier in each log entry (e.g. a `testType: "sequential"` or `testType: "concurrent"` field).

- Should the NestJS app log a test-type label passed in the request (e.g. a query param or header set by Artillery), or is another approach acceptable?

A: Log a test type anyways, but I expected the dashboard widgets to be set up targeting separate log groups for each test type

- What default time range should the Logs Insights widgets query — e.g. last 1 hour, last 24 hours?

A: 1 hour is fine

---

## Artillery Workflow: How Does It Know the Endpoint URLs?

The Artillery GitHub workflow runs after the stack is deployed. It needs to know the ALB endpoint URL(s), which are only known after CloudFormation completes.

- Should the workflow fetch these from **CloudFormation stack outputs** via the AWS CLI at runtime?

A: Yes

- Does the Artillery workflow use the same IAM role as the deploy workflow, or a separate one with narrower permissions (CloudWatch read + HTTP only)?

A: Separate IAM role please. The principle of least privilege must prevail.

---

## MySQL Client Library & Pool Configuration

The shared NestJS module manages the MySQL connection. A library needs to be chosen:
- **mysql2** (most common, lightweight, supports pooling natively)
- **TypeORM** with `@nestjs/typeorm` (heavier ORM, supports connection pool)
- **Knex** (query builder, supports pooling via `tarn`)

For the pooled app, what pool settings should be used:
- Max connections?
- Min connections?
- Connection acquire timeout?

These values will directly affect the PROCESSLIST output, so they're worth setting deliberately.

A: I cannot answer this yet. I expected the connection pool to be part of the Aurora cluster, not the NestJS app

---

## PROCESSLIST Query: Which Fields?

You asked for `SELECT` with specific fields from `information_schema.processlist` rather than `SHOW FULL PROCESSLIST`. Which fields do you want returned and logged? The available columns are: `ID`, `USER`, `HOST`, `DB`, `COMMAND`, `TIME`, `STATE`, `INFO`.

A reasonable default would be `ID, USER, HOST, DB, COMMAND, TIME, STATE, INFO` (all of them), but if you want a subset, now is the time to specify.

A: All of them sounds fine.

---

## GitHub Secrets: What You Need to Create

Once the bootstrap stack is deployed, the only GitHub secret required for OIDC is:

- `AWS_ACCOUNT_ID` — your 12-digit AWS account number (used to construct the role ARN in the workflow).

No `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` are needed with OIDC. Can you confirm this is clear?

A: Yes, that is clear

---

## Integration Tests: When Do They Run?

The Docker Compose integration tests verify the query and output handling locally.

- Should these run automatically in a **GitHub Actions CI workflow** on push/PR (using Docker Compose in the runner), or are they intended for **local use only**?

A: This should be considered a blocking step in the CI workflow. If these tests fail, the build should fail.

- Should Vitest also be the test runner for integration tests, or a separate runner?

A: Vitest should be the test runner for integration tests.
