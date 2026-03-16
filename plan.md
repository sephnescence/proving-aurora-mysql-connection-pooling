This project aims to observe the output from Amazon RDS Aurora with and without pooling in place.

Using pnpm for package management, create a new node project. One package will contain code to query a provided mysql connection and log the results to Cloudwatch (provided by ARN). Two other packages will consume this package, each creating a Cloudformation file to create a stack with the following resources: Lambda function, Lambda permission, Cloudwatch log group, Cloudwatch alarm, and a Cloudwatch dashboard. The difference between the two stacks is that one db cluster will use a connection pool and the other will not. It is important that the database clusters are configured to use aurora for mysql.

A fourth package will be created, to use artillery to hit these lambda endpoints 15 times each, gather the output from cloudwatch, and output the results to the console.

Include a dockerfile for the two database clusters + lambda functions, the fourth package, and a docker-compose file to run them locally.

Please create unit tests to validate the functionality of the lambda functions that call the database query, and ensure the results are logged to cloudwatch logs.

Please also include Playwright tests to verify the functionality of the lambda functions and the database clusters in local development.

When developing the code, please research and study https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/creating-resources-with-cloudformation.html to ensure you truly understand how to configure the cloudformation file.