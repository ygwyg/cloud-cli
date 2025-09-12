#!/bin/bash

echo "Installing Cloud CLI..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required but not installed."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is required but not installed."
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "Failed to install dependencies"
    exit 1
fi

# Make the script executable
chmod +x index.js

# Link globally
echo "Linking CLI globally..."
npm link

if [ $? -ne 0 ]; then
    echo "Failed to link CLI globally. You may need to run with sudo:"
    echo "sudo npm link"
    exit 1
fi

echo "Cloud CLI installed successfully!"
echo ""
echo "Usage:"
echo "  cloud help                       Show help"
echo "  cloud ./Dockerfile               Ship a local container"
echo "  cloud nginx:alpine               Ship a remote image"
echo ""
echo "Example:"
echo "  cloud nginx:alpine --ship --name my-app"
echo ""
echo "Ready to deploy containers to the cloud."
