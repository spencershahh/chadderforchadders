#!/bin/bash

# Print Node and npm versions for debugging
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Clean install dependencies
echo "Installing dependencies..."
npm ci

# Run the build
echo "Building the application..."
npm run build

echo "Build completed."
