#!/usr/bin/env bash
# Build the image with the current git SHA, push to ECR, update the ECS Express Mode service, wait for /healthz to show the SHA.
# Needs in .env or the environment: AWS_REGION, AWS_PROFILE, ECR_REPO (full URI), ECS_CLUSTER, ECS_SERVICE, BASE_URL.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
: "${ECR_REPO:?set ECR_REPO (e.g. 123456789012.dkr.ecr.us-west-2.amazonaws.com/concierge)}"
: "${ECS_CLUSTER:?}" "${ECS_SERVICE:?}" "${BASE_URL:?}"
SHA=$(git rev-parse --short HEAD)
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "${ECR_REPO%%/*}"
docker build --platform linux/amd64 --build-arg GIT_SHA="$SHA" -t "$ECR_REPO:$SHA" -t "$ECR_REPO:latest" .
docker push "$ECR_REPO:$SHA" && docker push "$ECR_REPO:latest"
TASK_DEF=$(aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" --query 'services[0].taskDefinition' --output text)
NEW_DEF=$(aws ecs describe-task-definition --task-definition "$TASK_DEF" --query 'taskDefinition' \
  | jq --arg img "$ECR_REPO:$SHA" '.containerDefinitions[0].image=$img | del(.taskDefinitionArn,.revision,.status,.requiresAttributes,.compatibilities,.registeredAt,.registeredBy)')
NEW_ARN=$(aws ecs register-task-definition --cli-input-json "$NEW_DEF" --query 'taskDefinition.taskDefinitionArn' --output text)
aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" --task-definition "$NEW_ARN" >/dev/null
echo "waiting for $BASE_URL/healthz to report $SHA"
for _ in $(seq 1 60); do
  if curl -fsS "$BASE_URL/healthz" | grep -q "\"$SHA\""; then echo "deployed $SHA"; exit 0; fi
  sleep 10
done
echo "timed out waiting for $SHA" >&2; exit 1
