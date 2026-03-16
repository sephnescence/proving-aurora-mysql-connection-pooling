# Round 7 Clarifications & Challenged Assumptions

## Kubernetes Namespace

The NestJS deployments, services, and ExternalSecrets all need a namespace. This also directly affects how Fluent Bit routes logs — it filters pod logs by namespace/label to direct them to the correct CloudWatch log group.

Options:
- **`default`** — no namespace creation needed, simpler
- **`pooling-poc`** — a dedicated namespace, cleaner separation from system pods, and Fluent Bit can scope log routing to this namespace

Which do you prefer?

A: pooling-poc

---

## Kubernetes Manifests Location

The Kubernetes YAML files (Deployments, Services, Ingress, ExternalSecrets, Fluent Bit config) cannot live inside CloudFormation — they need to be separate files in the repo, applied via `kubectl apply` in the deploy workflow.

Where should these live?

- **`k8s/`** at the repo root — all manifests in one place
- **Inside each app directory** — `apps/pooled-app/k8s/`, `apps/unpooled-app/k8s/` — co-located with the app code

A: k8s/ at the repo root

---

## EKS Cluster Name

The deploy and teardown workflows both run `aws eks update-kubeconfig --name {cluster-name}`. The cluster name needs to be known ahead of time (or read from CloudFormation stack outputs at runtime).

Two options:
- **Hardcode** the cluster name in the workflows (e.g., `aurora-pooling-poc-eks`)
- **Read from CloudFormation outputs** at runtime (more robust to changes)

Which do you prefer? If hardcoding: is `aurora-pooling-poc-eks` acceptable?

A: Hardcode `aurora-pooling-poc-eks`

---

## Teardown Bootstrap: Guard Against Premature Execution

The `teardown-bootstrap.yml` workflow deletes the OIDC provider and IAM roles. If run while the main stack still exists, the main stack's Artillery IAM role (which trusts the OIDC provider) would be orphaned, and future deployments would fail.

Should `teardown-bootstrap.yml` check that the main stack (`aurora-pooling-poc`) **no longer exists** before proceeding, and fail with an error if it still does?

A: Yes

---

## Note: Three IRSA Roles in CloudFormation

Confirming — the main CloudFormation stack will need to create the following IAM roles automatically, with no input required from you:

1. **ESO IRSA role** — allows the External Secrets Operator to read from Secrets Manager
2. **AWS Load Balancer Controller IRSA role** — allows the ALB Controller to create/manage ALBs
3. **Fluent Bit IRSA role** — allows Fluent Bit to write logs to CloudWatch Logs
4. **Artillery IAM role** — assumed by the Artillery GitHub Actions workflow

All four are distinct from the deploy IAM role in the bootstrap stack. Just acknowledging these are all being included.

A: Acknowledged

---

## Artillery YAML: Target URL Variable

The Artillery YAML config files need the ALB endpoint URL. This isn't known until after the stack is deployed. The GitHub Actions artillery workflows will fetch it from CloudFormation stack outputs and pass it to Artillery.

Artillery supports environment variable substitution in YAML config via `{{ $env.VAR_NAME }}`. The workflow would set `TARGET_URL` before invoking Artillery.

This is a proposed implementation detail — no action required unless you want a different approach.

A: Acknowledged

---

## `db-query` Service Interface: Proposed Signature

Based on the unit test requirement (verify logger is called with `testType` and `rows`), the service method needs `testType` as an input so it can include it in the structured log entry.

Proposed interface:

```typescript
// In @pooling-poc/db-query
processlist(testType: string): Promise<ProcesslistRow[]>
```

The service logs `{ message: 'processlist_result', testType, rowCount, rows }` via nestjs-pino, then returns the rows. The NestJS controller passes the `X-Test-Type` header value to this method.

Is this interface acceptable?

A: Yes

---

## CloudWatch Logs Insights: Proposed Query Structure

The Artillery polling script will run the following Logs Insights query for each of the four widget combinations (pooled/unpooled × sequential/concurrent):

```
fields @timestamp, testType, rowCount, rows
| filter testType = "sequential"
| sort @timestamp desc
| limit 50
```

The console output would print:
1. **Raw entries** — the above query result formatted as a table
2. **Summary** — average `rowCount` across all requests in the run (showing how many DB connections were visible per request on average)

Is this structure acceptable for what you want to see?

A: Yes
