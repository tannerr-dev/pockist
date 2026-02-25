#!/bin/bash
set -e

# Server-side deployment script
# Usage: ./deploy-server.sh <archive-file> [image-name] [container-name] [port]

ARCHIVE_FILE="${1:?Usage: $0 <archive-file> [image-name] [container-name] [port]}"
IMAGE_NAME="${2:-pockist}"
IMAGE_TAG="latest"
CONTAINER_NAME="${3:-pockist}"
HOST_PORT="${4:-8080}"

if [ ! -f "${ARCHIVE_FILE}" ]; then
    echo "Error: Archive file '${ARCHIVE_FILE}' not found"
    exit 1
fi

echo "Stopping existing container '${CONTAINER_NAME}'..."
docker stop "${CONTAINER_NAME}" 2>/dev/null || true
docker rm "${CONTAINER_NAME}" 2>/dev/null || true

echo "Loading Docker image from ${ARCHIVE_FILE}..."
docker load < "${ARCHIVE_FILE}"

echo "Starting new container..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "${HOST_PORT}:8080" \
  -v "$(pwd)/data:/app/data" \
  "${IMAGE_NAME}:${IMAGE_TAG}"

echo "Cleaning up archive..."
rm -f "${ARCHIVE_FILE}"

echo ""
echo "Deployment complete!"
echo "Container status:"
docker ps | grep "${CONTAINER_NAME}"
echo ""
echo "Logs:"
docker logs --tail 5 "${CONTAINER_NAME}"
