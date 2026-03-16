# Round 2 Clarifications & Challenged Assumptions

## EKS Architecture — Cost & Complexity Challenge

EKS is significantly more expensive than Lambda for a PoC. A single EKS cluster costs ~$0.10/hr for the control plane endpoint alone, plus EC2 node costs (~$0.05+/hr per t3.small node), NAT gateway, and load balancer. Two separate EKS clusters (one per stack) would roughly double that.

- Should both the pooled and non-pooled NestJS apps share **one EKS cluster** with two separate Deployments/Services, or live in two completely separate EKS clusters?

A: In that case, please use one EKS cluster with two separate Deployments/Services.

- If sharing one cluster: do they still get separate CloudFormation stacks, or one combined stack?

A: In that case, please use one combined stack.

- Are you aware of the ~15–20 minute EKS cluster creation time during deploys?

A: Yes, that is fine. I need to run these tests in a production-like environment, so I'm not too concerned about the time it takes to create the cluster.

---

## Aurora: Serverless v2 or Provisioned?

"1 ACU" is terminology specific to **Aurora Serverless v2**. Provisioned Aurora uses instance types (e.g. `db.t3.medium`) with no ACU concept. 1 ACU on Serverless v2 is fine for 15 concurrent SHOW PROCESSLIST queries.

- Can you confirm you want **Aurora Serverless v2** (not provisioned instances)?

A: Yes, I can confirm that I want Aurora Serverless v2.

- Do you want **one Aurora cluster per stack** (two total), or one shared cluster with separate databases/schemas — one for the pooled app and one for the unpooled app?

Note: Two separate Aurora Serverless v2 clusters is valid but means two sets of Aurora costs.

A: Two separate clusters please. One will have a connection pool, and the other will not

---

## VPC & Networking

Aurora must live in private subnets, and EKS nodes must be able to reach it. This requires a VPC with public and private subnets, NAT gateway, and appropriate security groups — none of which are in the current resource list.

- Should the CloudFormation stacks create a **new VPC**, or do you have an existing VPC in `ap-southeast-2` to use?

A: Please create a new VPC.

- If creating a new VPC: should it be shared across both stacks, or separate per stack?

A: Actually, to ensure that the two stacks are completely isolated, please create a new VPC for each stack.

---

## Docker Images & ECR

NestJS apps running on EKS need to be built into Docker images and pushed to a container registry. ECR (Elastic Container Registry) is the natural choice in AWS.

- Should the CloudFormation stacks provision ECR repositories, or do you have existing ones?

A: Please provision ECR repositories.

- The GitHub deploy workflow will need to build images and push to ECR before deploying to EKS — is that the expected order of operations?

A: Yes, that is the expected order of operations. I will provide secrets for the github actions to use. Please let me know what they'll be called, and I'll make them myself in Github's Repository Secrets.

---

## GitHub Actions AWS Authentication

- How should GitHub Actions authenticate with AWS — **OIDC** (no long-lived secrets, recommended) or **access key + secret stored as GitHub secrets**?

A: Ideally, it will have its own IAM role that is assumable by the github actions workflow. Please follow the principle of least privilege, and only give it the permissions it needs to perform its job. I will be reviewing this and deploying it manually.

- If OIDC: do you have an existing IAM OIDC provider configured for GitHub in your AWS account, or should the CloudFormation stack create one?

A: I don't have an existing IAM OIDC provider configured for GitHub in my AWS account. Please create one.

---

## Artillery Package Deploying Stacks — Sequencing Challenge

EKS stack creation takes 15–20+ minutes. If the Artillery package is responsible for deploying the stacks before running tests, it will need to wait that long before firing requests. This is unusual for a load-testing tool.

- Should the **GitHub workflow** handle deploy → wait for readiness → run Artillery, rather than Artillery orchestrating the deployment itself?

A: Please create separate github actions. Once I know the stack is healthy, I can then run whichever artillery test I desire

- Or is it acceptable for the Artillery package to shell out to `aws cloudformation deploy` and wait?

A: N/A

---

## CloudWatch Dashboard Challenge

CloudWatch dashboards display **metrics**, not raw log lines. The SHOW PROCESSLIST output will be in CloudWatch Logs, not a metric. You can show log data on a dashboard via a **Logs Insights widget**, but it queries logs rather than displaying a live feed.

- Is a Logs Insights widget (showing the most recent PROCESSLIST query results from each stack) sufficient, or did you have something else in mind?

A: That is sufficient

- Should the dashboard show results from both stacks side-by-side for comparison?

A: Sure. Same dashboard, but four separate widgets, two for each stack. One for the sequential test, and one for the concurrent test

---

## Local Docker Compose — Kubernetes or Not?

For the integration test (verifying the query runs and output is handled without errors), a full local Kubernetes environment (minikube/kind) is heavy and complex. A simpler approach is Docker Compose with:
- A MySQL container
- The two NestJS app containers

This would not prove connection pooling itself locally (that's for the Aurora proof), but would satisfy your stated goal of verifying the query and output handling.

A: This is an integration test with the sole purpose of verifying the query doesn't encounter errors and the output is handled correctly. Docker Compose with plain MySQL is acceptable for this purpose.

- Is Docker Compose with plain MySQL (no local Kubernetes) acceptable for local integration testing?

A: Yes, that is acceptable.

---

## Database Credentials

Aurora requires a username and password. In EKS, those need to be injected into the NestJS pods securely.

- Should credentials be stored in **AWS Secrets Manager** (and pulled into Kubernetes via External Secrets Operator or similar), or as **CloudFormation parameters** passed at deploy time?

A: Please use AWS Secrets Manager. I'd like to use the External Secrets Operator to pull the credentials into Kubernetes.

- For local Docker Compose: hardcoded in a `.env` file is fine?

A: Yes, that is fine.

---

## Shared Package: NestJS Module or Plain TypeScript?

The shared query package will be consumed by two NestJS apps.

- Should it export a **NestJS Module + injectable Service** (so apps import it as a module), or a **plain TypeScript class** that NestJS apps wrap themselves?

A: Please use a NestJS Module + injectable Service.

---

## Jest Tests — Scope

You said: "unit tests to ensure mocked output from the database will be handled correctly by the typescript package."

- Are tests only needed for the **shared query package**, or also for the NestJS app controllers/services?

A: The shared query package test you're describing is a unit test. Testing the app controllers and services sounds like it might be an integration test

- Should `ts-jest` be used for TypeScript support, or is there a preference for another approach (e.g. Vitest)?

A: Please use Vitest. It's faster and has better TypeScript support.

---

## Artillery "Three Threads × 5 Sequential"

In Artillery, load is modelled as virtual users, not threads. "3 threads performing 5 sequential requests each" would be 3 virtual users, each making 5 sequential requests (15 total), with all 3 running concurrently.

- Is that the correct interpretation — 3 VUs running in parallel, each completing 5 requests in sequence before finishing?

A: Yes, that is the correct interpretation.

- For the 15 concurrent test: is that 15 VUs each making 1 request simultaneously?

A: Yes, that is the correct interpretation.
