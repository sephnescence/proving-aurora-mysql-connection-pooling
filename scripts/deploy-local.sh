#!/usr/bin/env bash
# deploy-local.sh
#
# Manually deploys the full aurora-pooling-poc environment from your local machine.
# Use this when you want to get infrastructure up without triggering the GitHub Actions
# deploy workflow — e.g. for initial bring-up or local iteration.
#
# Prerequisites:
#   - AWS CLI configured with sufficient credentials (AdministratorAccess recommended)
#   - Docker running
#   - kubectl installed
#   - helm installed
#   - envsubst installed (part of gettext, available via: brew install gettext)
#
# Usage:
#   chmod +x scripts/deploy-local.sh
#   ./scripts/deploy-local.sh

set -euo pipefail

REGION=ap-southeast-2
STACK_MAIN=aurora-pooling-poc
STACK_BOOTSTRAP=aurora-pooling-poc-bootstrap

# Helper to read a CloudFormation stack output by key
get_output() {
  aws cloudformation describe-stacks \
    --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" \
    --output text \
    --region $REGION
}

echo "==> Fetching ECR URIs from bootstrap stack..."
ECR_REPO_POOLED=$(get_output $STACK_BOOTSTRAP ECRPooledAppUri)
ECR_REPO_UNPOOLED=$(get_output $STACK_BOOTSTRAP ECRUnpooledAppUri)

echo "    Pooled ECR:   $ECR_REPO_POOLED"
echo "    Unpooled ECR: $ECR_REPO_UNPOOLED"

echo "==> Logging in to ECR..."
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin "$ECR_REPO_POOLED"

echo "==> Building and pushing Docker images..."
IMAGE_TAG=$(git rev-parse HEAD)

docker build -f apps/pooled-app/Dockerfile -t "$ECR_REPO_POOLED:$IMAGE_TAG" .
docker push "$ECR_REPO_POOLED:$IMAGE_TAG"

docker build -f apps/unpooled-app/Dockerfile -t "$ECR_REPO_UNPOOLED:$IMAGE_TAG" .
docker push "$ECR_REPO_UNPOOLED:$IMAGE_TAG"

echo "==> Creating EKS Nodegroup service-linked role (if not exists)..."
# Required for AWS::EKS::Nodegroup to create node groups in this account.
# This is a one-time account-level prerequisite — safe to run on every deploy.
if ! aws iam get-role --role-name AWSServiceRoleForAmazonEKSNodegroup --region $REGION 2>/dev/null; then
  echo "    Service-linked role not found — creating..."
  aws iam create-service-linked-role --aws-service-name eks-nodegroup.amazonaws.com
else
  echo "    AWSServiceRoleForAmazonEKSNodegroup already exists, skipping."
fi

echo "==> Creating ALB Controller IAM policy (if not exists)..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if ! aws iam get-policy \
  --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy" \
  --region $REGION 2>/dev/null; then
  echo "    Policy not found — downloading and creating..."
  curl -o alb-iam-policy.json \
    https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.11.0/docs/install/iam_policy.json
  aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://alb-iam-policy.json \
    --region $REGION
  rm alb-iam-policy.json
else
  echo "    AWSLoadBalancerControllerIAMPolicy already exists, skipping."
fi

echo "==> Deploying CloudFormation main stack..."
aws cloudformation deploy \
  --template-file infra/main.yml \
  --stack-name $STACK_MAIN \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    ImageTagPooled="$IMAGE_TAG" \
    ImageTagUnpooled="$IMAGE_TAG" \
  --region $REGION

echo "==> Updating kubeconfig..."
aws eks update-kubeconfig \
  --name aurora-pooling-poc-eks \
  --region $REGION

echo "==> Fetching main stack outputs..."
export POOLED_DB_HOST=$(get_output $STACK_MAIN PooledDbHost)
export UNPOOLED_DB_HOST=$(get_output $STACK_MAIN UnpooledDbHost)
export POOLED_DB_SECRET_ARN=$(get_output $STACK_MAIN PooledDbSecretArn)
export UNPOOLED_DB_SECRET_ARN=$(get_output $STACK_MAIN UnpooledDbSecretArn)
export ESO_ROLE_ARN=$(get_output $STACK_MAIN EsoRoleArn)
export ALB_CONTROLLER_ROLE_ARN=$(get_output $STACK_MAIN AlbControllerRoleArn)
export FLUENT_BIT_ROLE_ARN=$(get_output $STACK_MAIN FluentBitRoleArn)
export ECR_REPO_POOLED ECR_REPO_UNPOOLED IMAGE_TAG

echo "==> Installing Helm charts..."
helm repo add external-secrets https://charts.external-secrets.io
helm repo add eks https://aws.github.io/eks-charts
helm repo add aws https://aws.github.io/eks-charts
helm repo update

helm upgrade --install external-secrets external-secrets/external-secrets \
  --namespace external-secrets-system --create-namespace --wait

helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --namespace kube-system \
  --set clusterName=aurora-pooling-poc-eks \
  --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=$ALB_CONTROLLER_ROLE_ARN" \
  --wait

helm upgrade --install aws-for-fluent-bit aws/aws-for-fluent-bit \
  --namespace amazon-cloudwatch --create-namespace \
  --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=$FLUENT_BIT_ROLE_ARN" \
  --set cloudWatch.enabled=true \
  --set cloudWatch.region=$REGION \
  --set cloudWatch.logGroupName=/aurora-pooling-poc/$(POD_LABEL_APP) \
  --wait

echo "==> Applying Kubernetes manifests..."
for manifest in \
  k8s/namespace.yaml \
  k8s/pooled-app-external-secret.yaml \
  k8s/unpooled-app-external-secret.yaml \
  k8s/pooled-app.yaml \
  k8s/unpooled-app.yaml \
  k8s/ingress.yaml; do
  envsubst < "$manifest" | kubectl apply -f -
done

echo "==> Waiting for deployments to be ready..."
kubectl rollout status deployment/pooled-app -n pooling-poc --timeout=300s
kubectl rollout status deployment/unpooled-app -n pooling-poc --timeout=300s

echo ""
echo "✓ Deploy complete. Run 'kubectl get pods -n pooling-poc' to verify."
