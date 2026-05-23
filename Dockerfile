# Build stage
FROM golang:1.25-alpine AS builder

# Install build dependencies for SQLite3
RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /app

# Copy go mod files first for dependency caching
COPY go.mod go.sum ./
RUN go mod download

# Copy only Go source code before building
# This ensures changes to public/ (static assets) don't invalidate the go build cache
COPY main.go .
COPY handlers/ ./handlers/
COPY pkg/ ./pkg/
COPY token/ ./token/

# Build the binary with CGO enabled for SQLite3
RUN CGO_ENABLED=1 GOOS=linux go build -o pockist .

# Copy static assets AFTER the build so public/ changes don't invalidate the go build cache
# The final stage will pull both the binary and public/ from this builder stage
COPY public/ ./public/

# Final stage
FROM alpine:latest

# Install SQLite runtime dependency
RUN apk add --no-cache ca-certificates sqlite-libs

WORKDIR /app

# Copy the binary and static assets from builder
COPY --from=builder /app/pockist .
COPY --from=builder /app/public ./public

# Create a directory for the SQLite database
RUN mkdir -p /app/data

# Declare volume for persistent data (shares, imports)
VOLUME ["/app/data"]

EXPOSE 4242

CMD ["./pockist"]
