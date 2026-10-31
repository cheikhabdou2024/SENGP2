#!/usr/bin/env bash
# Wait until the App Runner service is RUNNING again after an operation.
# Usage: scripts/wait-apprunner.sh <service-arn>
set -euo pipefail
ARN="$1"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
for _ in $(seq 1 80); do
  ST=$(aws apprunner describe-service --service-arn "$ARN" --region "$REGION" --query 'Service.Status' --output text)
  echo "apprunner $ST"
  case "$ST" in
    RUNNING) exit 0 ;;
    *FAILED*) echo "DEPLOY FAILED"; exit 1 ;;
  esac
  sleep 15
done
echo "TIMEOUT waiting for App Runner"; exit 1
