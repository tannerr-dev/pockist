# Build stage
FROM golang:1.25-alpine AS builder

# Install build dependencies for SQLite3
RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary with CGO enabled for SQLite3
RUN CGO_ENABLED=1 GOOS=linux go build -o pockist .

# Final stage
FROM alpine:latest

# Install SQLite runtime dependency
RUN apk add --no-cache ca-certificates sqlite-libs

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/pockist .

# Copy static assets
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/public ./public
COPY --from=builder /app/data ./data

# Create a directory for the SQLite database
RUN mkdir -p /app/data

EXPOSE 8080

CMD ["./pockist"]
