#!/usr/bin/env bash
# Roll the backend back to a previous build.
# Usage: scripts/rollback-backend.sh            -> lists the available build tags
#        scripts/rollback-backend.sh build-42   -> makes build-42 the running image
# Only works for builds made after buildspec.yml started pushing build-<number> tags.
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
REPO="${SENGP_ECR_REPO:-sengp-backend}"
SERVICE="${SENGP_APPRUNNER_SERVICE:-sengp-backend}"
TAG="${1:-}"

if [ -z "$TAG" ]; then
  aws ecr describe-images --repository-name "$REPO" --region "$REGION" \
    --query 'sort_by(imageDetails,&imagePushedAt)[?imageTags!=`null`].[imageTags[0],imagePushedAt]' --output table
  exit 0
fi

MANIFEST=$(aws ecr batch-get-image --repository-name "$REPO" --region "$REGION" \
  --image-ids imageTag="$TAG" --query 'images[0].imageManifest' --output text)
[ "$MANIFEST" != "None" ] || { echo "Tag $TAG not found in $REPO"; exit 1; }

aws ecr put-image --repository-name "$REPO" --region "$REGION" --image-tag latest \
  --image-manifest "$MANIFEST" > /dev/null
echo ":latest now points to $TAG"

ARN=$(aws apprunner list-services --region "$REGION" --query "ServiceSummaryList[?ServiceName=='$SERVICE'].ServiceArn" --output text)
aws apprunner start-deployment --service-arn "$ARN" --region "$REGION" --query OperationId --output text
"$(dirname "$0")/wait-apprunner.sh" "$ARN"

URL=$(aws apprunner describe-service --service-arn "$ARN" --region "$REGION" --query 'Service.ServiceUrl' --output text)
curl -fsS "https://$URL/health/ready" && echo
echo "ROLLED BACK to $TAG"
