#!/bin/bash
set -e

# Configuration - modify these or set as environment variables
IMAGE_NAME="${IMAGE_NAME:-pockist}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
SERVER_HOST="${SERVER_HOST:-your-server.com}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_DIR="${SERVER_DIR:-/opt/pockist}"
CONTAINER_NAME="${CONTAINER_NAME:-pockist}"
CONTAINER_PORT="${CONTAINER_PORT:-8080}"

ARCHIVE_NAME="${IMAGE_NAME}_${IMAGE_TAG}.tar.gz"

echo "Building Docker image..."
docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" .

echo "Saving image to archive..."
docker save "${IMAGE_NAME}:${IMAGE_TAG}" | gzip > "${ARCHIVE_NAME}"

echo "Archive created: ${ARCHIVE_NAME}"
echo "Size: $(du -h "${ARCHIVE_NAME}" | cut -f1)"

echo "Uploading to server ${SERVER_HOST}..."
ssh "${SERVER_USER}@${SERVER_HOST}" "mkdir -p ${SERVER_DIR}"
scp "${ARCHIVE_NAME}" "${SERVER_USER}@${SERVER_HOST}:${SERVER_DIR}/"

echo "Deploying on server..."
ssh "${SERVER_USER}@${SERVER_HOST}" "cd ${SERVER_DIR} && bash -s" << 'REMOTE_SCRIPT'
#!/bin/bash
set -e

ARCHIVE_NAME="$1"
IMAGE_NAME="$2"
IMAGE_TAG="$3"
CONTAINER_NAME="$4"
CONTAINER_PORT="$5"

echo "Loading Docker image..."
docker load < "${ARCHIVE_NAME}"

echo "Stopping existing container..."
docker stop "${CONTAINER_NAME}" 2>/dev/null || true
docker rm "${CONTAINER_NAME}" 2>/dev/null || true

echo "Starting new container..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "${CONTAINER_PORT}:8080" \
  -v "$(pwd)/data:/app/data" \
  "${IMAGE_NAME}:${IMAGE_TAG}"

echo "Cleaning up..."
rm -f "${ARCHIVE_NAME}"

echo "Deployment complete!"
docker ps | grep "${CONTAINER_NAME}"
REMOTE_SCRIPT "${ARCHIVE_NAME}" "${IMAGE_NAME}" "${IMAGE_TAG}" "${CONTAINER_NAME}" "${CONTAINER_PORT}"

echo "Local cleanup..."
rm -f "${ARCHIVE_NAME}"

echo "All done!"
