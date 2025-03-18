#!/bin/bash
set -e

echo "Starting custom build script..."
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Check if environment variables are accessible
echo "Checking environment variables..."
if [ -n "$VITE_TWITCH_CLIENT_ID" ]; then
  echo "VITE_TWITCH_CLIENT_ID is set"
else
  echo "VITE_TWITCH_CLIENT_ID is NOT set"
fi

if [ -n "$VITE_TWITCH_CLIENT_SECRET" ]; then
  echo "VITE_TWITCH_CLIENT_SECRET is set"
else
  echo "VITE_TWITCH_CLIENT_SECRET is NOT set"
fi

# Ensure .env file exists with variables
echo "Creating/updating .env file with environment variables..."
echo "VITE_TWITCH_CLIENT_ID=${VITE_TWITCH_CLIENT_ID:-}" > .env
echo "VITE_TWITCH_CLIENT_SECRET=${VITE_TWITCH_CLIENT_SECRET:-}" >> .env

echo "Installed dependencies:"
npm list --depth=0

echo "Running build with detailed logging..."
npm run build

echo "Build complete. Checking output directory:"
ls -la dist

echo "Custom build script completed successfully."
