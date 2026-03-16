# proving-aurora-mysql-connection-pooling
Seeing if I can prove connection pooling in Amazon RDS Aurora for MySQL

The work involved in this project will see the creation of multiple cloudformation stacks. Each github workflow will have their own IAM role, which will need to be deployed manually first.

Each github action will need to have access to the following github secret - AWS_ACCOUNT_ID. This needs to be added to the github repository secrets manually.

The Github Repository will also need to be set up to require branch protection rules for the main branch. This will need to be done manually.
