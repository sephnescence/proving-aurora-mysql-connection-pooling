# Round 10 Clarifications & Challenged Assumptions

## Scheduled Workflow: New File or Trigger in `ci.yml`?

You asked to "create a github workflow that runs every 24 hours at noon Brisbane time." This can be implemented two ways:

- **Add a `schedule:` trigger to `ci.yml`** — the same workflow file gains an additional trigger. Cleanest, no duplication.
- **Separate `scheduled.yml` file** — identical job steps duplicated in a second file, or calls `ci.yml` as a reusable workflow.

Since the scheduled run is doing exactly the same work as `ci.yml`, adding the schedule trigger directly to `ci.yml` is the recommended approach. One file, one source of truth.

Brisbane does not observe daylight saving (always UTC+10). Noon Brisbane = **02:00 UTC**. Cron expression: `0 2 * * *`.

Is adding the schedule trigger to `ci.yml` acceptable, or do you explicitly want a separate file?

A: Please just add the schedule

---

## Deploy and Teardown Workflows: Branch Restriction

`deploy.yml` and `teardown.yml` are manually triggered (`workflow_dispatch`). Without a branch restriction, anyone can trigger them from any branch — including feature branches with untested code hitting real AWS resources.

Should these workflows be **restricted to run only from `main`**? GitHub supports this via `workflow_dispatch` with a branch filter, or by adding an explicit check at the start of the workflow that fails if the current branch is not `main`.

A: Yes, only run from main

---

## CloudWatch Polling: Continuous or Single Query?

The Artillery polling script runs for 5 minutes after the load test finishes. Two interpretations of "poll for 5 minutes":

- **Continuous** — query Logs Insights every 30 seconds for 5 minutes (10 iterations), printing updated results each time. Captures logs as they propagate into CloudWatch (propagation can lag by 15–60 seconds).
- **Single query** — wait 5 minutes, then run one Logs Insights query covering the test window, print results, exit.

The continuous approach is more useful for observing propagation delay and confirming all logs have arrived. The single query is simpler to implement.

Which do you prefer?

A: Continuous

---

## `packages/load-tests`: TypeScript or JavaScript for the Polling Script?

The CloudWatch polling script needs a runtime to execute. Options:

- **TypeScript with `tsx`** — consistent with the rest of the workspace (all TypeScript). Runs directly via `tsx poll.ts` without a separate compile step.
- **Plain JavaScript** — no build tooling needed for a CLI script.

Given the whole workspace is TypeScript, using `tsx` for the polling script keeps things consistent. Is that acceptable?

A: TypeScript with tsx

---

## Final Workflow Inventory

Confirming the complete set of GitHub Actions files based on all decisions:

| File | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Push (all branches), `workflow_dispatch`, schedule `0 2 * * *` | Unit tests + Docker Compose integration tests |
| `deploy.yml` | `workflow_dispatch` (main only) | Deploy bootstrap-aware main stack + Helm + K8s manifests |
| `teardown.yml` | `workflow_dispatch` (main only) | K8s cleanup → delete main CF stack |
| `teardown-bootstrap.yml` | `workflow_dispatch` (main only) | Guard check → empty ECR → delete bootstrap CF stack |
| `artillery-sequential.yml` | `workflow_dispatch` (main only) | 3 VU × 5 req test → poll CloudWatch |
| `artillery-concurrent.yml` | `workflow_dispatch` (main only) | 15 VU × 1 req test → poll CloudWatch |

Is this correct and complete?

A: Yes
