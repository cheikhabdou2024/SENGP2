#!/usr/bin/env bash
# Deploy the backend: zip sources -> S3 -> CodeBuild -> App Runner.
# Requires AWS credentials for the SEN GP account in the environment (never committed).
# Usage: scripts/deploy-backend.sh
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
BUCKET="${SENGP_ARTIFACT_BUCKET:-sengp-codebuild-711387127592}"
PROJECT="${SENGP_BUILD_PROJECT:-sengp-build}"
SERVICE="${SENGP_APPRUNNER_SERVICE:-sengp-backend}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="$(mktemp -d)/backend-src.zip"

echo "[0/4] tests"
(cd "$ROOT/backend" && npm run typecheck && npm test)

echo "[1/4] package sources"
(cd "$ROOT/backend" && zip -qr "$ZIP" Dockerfile package.json package-lock.json tsconfig.json src -x "node_modules/*")

echo "[2/4] upload"
aws s3 cp "$ZIP" "s3://$BUCKET/backend-src.zip" --only-show-errors --region "$REGION"

echo "[3/4] build"
BID=$(aws codebuild start-build --project-name "$PROJECT" --region "$REGION" --query 'build.id' --output text)
echo "build $BID"
while true; do
  ST=$(aws codebuild batch-get-builds --ids "$BID" --region "$REGION" --query 'builds[0].buildStatus' --output text)
  [ "$ST" != "IN_PROGRESS" ] && break
  sleep 10
done
[ "$ST" = "SUCCEEDED" ] || { echo "BUILD $ST"; exit 1; }

echo "[4/4] deploy"
ARN=$(aws apprunner list-services --region "$REGION" --query "ServiceSummaryList[?ServiceName=='$SERVICE'].ServiceArn" --output text)
aws apprunner start-deployment --service-arn "$ARN" --region "$REGION" --query OperationId --output text
"$ROOT/scripts/wait-apprunner.sh" "$ARN"

URL=$(aws apprunner describe-service --service-arn "$ARN" --region "$REGION" --query 'Service.ServiceUrl' --output text)
echo "verify https://$URL"
curl -fsS "https://$URL/health" > /dev/null && echo "health OK"
curl -fsS "https://$URL/health/ready" && echo
echo "DONE"
