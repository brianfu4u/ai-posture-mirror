#!/bin/bash
set -e

# One-Click Deployment Script for Overseas Backend to Google Cloud Run
# Usage: ./deploy.sh [PROJECT_ID] [REGION]

PROJECT_ID=${1:-$(gcloud config get-value project)}
REGION=${2:-"asia-northeast1"}
SERVICE_NAME="ai-posture-mirror-backend"

echo "=== Deploying AI Posture Mirror Overseas Backend ==="
echo "Project: $PROJECT_ID"
echo "Region:  $REGION"
echo "Service: $SERVICE_NAME"

# Build and deploy using Google Cloud Build & Cloud Run
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars NODE_ENV=production

echo "=== Deployment Succeeded! ==="
gcloud run services describe "$SERVICE_NAME" --platform managed --region "$REGION" --format 'value(status.url)'
