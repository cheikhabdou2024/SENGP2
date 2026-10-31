#!/usr/bin/env bash
# Copy backend/buildspec.yml into the `sengp-build` CodeBuild project (one-time, and after each edit).
# This changes AWS configuration: run it deliberately.
set -euo pipefail
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
PROJECT="${SENGP_BUILD_PROJECT:-sengp-build}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPEC="$(cat "$ROOT/backend/buildspec.yml")"

SRC=$(aws codebuild batch-get-projects --names "$PROJECT" --region "$REGION" --query 'projects[0].source' --output json)
NEW=$(echo "$SRC" | SPEC="$SPEC" python3 -c 'import json,os,sys; s=json.load(sys.stdin); s["buildspec"]=os.environ["SPEC"]; print(json.dumps(s))')
aws codebuild update-project --name "$PROJECT" --region "$REGION" --source "$NEW" --query 'project.name' --output text
echo "buildspec updated for $PROJECT"
