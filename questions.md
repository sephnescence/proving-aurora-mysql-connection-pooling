# Plan Clarifications & Challenged Assumptions

## Lambda + Connection Pooling Model

**Critical assumption to challenge:** Lambda doesn't pool connections the way a long-running server does. Each Lambda container holds at most one connection (or a small pool) that persists across *warm invocations* of that container. There's no shared pool across Lambda instances. If you fire 15 concurrent requests, you get 15 Lambda containers, each with their own connection — the "pool" never fills up.

- Is the intent to show connection *reuse across warm invocations* (sequential calls to the same container), rather than a traditional connection pool?

A: Yes, that's exactly what I want to do. In that case, please use nestjs, and create containers that I can deploy to EKS to create these long running servers. Please also configure EKS in the cloudformation files.

- Or are you expecting to simulate a scenario where a pool would be beneficial (e.g., a long-running process hitting Aurora at high concurrency)?

A: No.

---

## Missing CloudFormation Resource

The plan lists: Lambda function, Lambda permission, CloudWatch log group, alarm, dashboard. But Artillery will "hit these lambda endpoints" — **API Gateway or a Lambda Function URL is not listed**. How is the Lambda exposed as an HTTP endpoint?

A: With the pivot to EKS, I expect it will need configuration for a load balancer in the cloudformation files.

---

## Aurora Clusters in CloudFormation

- Are the Aurora clusters themselves being provisioned by CloudFormation, or are they pre-existing clusters whose connection details are passed in as parameters?

A: Provisioned by the cloudformation files you're making for me.

- If provisioned: Aurora is expensive (~$0.10+/hr per ACU) and slow to spin up. Is that intended?

A: Yes, that's intended. I only expect I'll need to spin up one ACU, assuming that this can handle the load of 15 concurrent requests. Please let me know if that isn't the case.

- What does the Lambda actually query? A specific table/schema? A test query like `SELECT 1`?

A: As I'm testing the connection pooling. Please query the mysql database itself for its process list. e.g. `SHOW FULL PROCESSLIST;`, but use the query that lets you also select specific fields to return. You cannot do this with the `SHOW FULL PROCESSLIST;` query, but there is an equivalent query that lets you do this. Please use that query instead.

---

## Local Development with Docker

- Aurora MySQL cannot run locally. The Docker setup would need a plain MySQL container as a stand-in. Is that acceptable, knowing it may not reproduce Aurora-specific behavior?

A: It doesn't have to be Aurora MySQL, but it must prove connection pooling. Is this possible with Docker?

- How should the Lambda run locally — AWS SAM, LocalStack, or just direct Node invocation?

A: Since we're pivoting to EKS, please advise what should be done here

- If using plain MySQL locally, pooling behavior may differ from Aurora. Does that matter for the proof?

A: No. It is for an integration test to ensure the query is able to be performed, and the code will log not encounter errors handling the output

---

## Artillery Test Package

- "15 times each" — is that 15 *concurrent* requests, 15 *sequential* requests, or some ramp pattern?

A: I'd like to test both patterns, actually. One test to simulate three threads performing 5 sequential requests each, and then another test to simulate 15 concurrent requests. I expect the connection pooling to have a noticeable impact on the performance of the lambda functions, so I want to see what happens when they're all hitting the database at once. I expect to see a difference in the output of show processlist between the two stacks, and I wouldn't be surprised if the sequential requests has a different output than the concurrent requests.

- "gather the output from CloudWatch" — CloudWatch log propagation has latency (seconds to minutes). How long should the test wait before fetching logs? Should it poll?

A: Please poll for 5 minutes to gather the output from cloudwatch

- Does this package deploy the stacks, or assume they're already deployed?

A: Please deploy the stacks

---

## Playwright Tests

Playwright is a browser automation tool. It has an API testing feature, but it's unusual for Lambda/DB testing with no UI.

- Did you mean Playwright's API testing specifically, or were you thinking of a different tool (e.g., Jest integration tests, Supertest)?

A: Sure, let's go with Jest. I just need unit tests to ensure mocked output from the database will be handled correctly by the typescript package

- If Playwright is intentional: what specifically needs a browser, if anything?

A: Apologies. Playwright is not needed after all.

---

## Monorepo Structure

- "pnpm workspaces" monorepo, or four independent packages that happen to use pnpm?

A: Please use pnpm workspaces

- The shared query package — does it export a function that accepts a connection/pool object, or does it manage the connection itself?

A: It should manage the connection itself. It should be able to be configured with environment variables, and should be able to be configured with a connection string.

- "provided mysql connection" and "provided by ARN" — are these environment variables, SSM parameters, Lambda event parameters, or something else?

A: Environment variables, from the stack output of the cloudformation stacks.

---

## CloudWatch Alarm + Dashboard

- What metric should the alarm trigger on (error rate, duration, connection count)?

A: Actually, I don't think we need alarms. I just want to see the output of the queries in the dashboard.

- What's on the dashboard — latency comparison between the two stacks side-by-side?

A: I'd like to see the output of the queries in the dashboard.

---

## Deployment

- Is there a deployment step (e.g., `aws cloudformation deploy`, CDK, SAM)? Or is generating the CloudFormation YAML the final output?

A: Please create github workflows that can be invoked to deploy the stacks. Please also create a github workflow that can be invoked to tear down the stacks.

- What AWS region?

A: ap-southeast-2
