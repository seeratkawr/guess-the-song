#!/bin/bash

# Script to start the frontend with a custom backend URL
# Usage: ./start-frontend.sh [backend_url]
# Example: ./start-frontend.sh http://192.168.0.101:8080

BACKEND_URL=${1:-"http://localhost:8080"}

echo "Starting frontend with backend URL: $BACKEND_URL"

# Set environment variables and start the dev server
VITE_SOCKET_URL="$BACKEND_URL" VITE_API_BASE_URL="$BACKEND_URL" npm run dev
