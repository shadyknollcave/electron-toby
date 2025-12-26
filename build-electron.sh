#!/bin/bash
set -e

echo "🔨 Building TobyAI Electron App in Containers..."

# Build backend
echo "📦 Building backend..."
podman run --rm \
  -v "$(pwd)":/workspace \
  -w /workspace/backend \
  node:22-alpine \
  sh -c "npm install && npm run build"

# Build frontend for Electron
echo "📦 Building frontend..."
podman run --rm \
  -v "$(pwd)":/workspace \
  -w /workspace/frontend \
  -e ELECTRON_BUILD=true \
  node:22-alpine \
  sh -c "npm install && npm run build"

# Build Electron (TypeScript compilation only)
echo "📦 Building Electron main process..."
podman run --rm \
  -v "$(pwd)":/workspace \
  -w /workspace/electron \
  node:22-alpine \
  sh -c "npm install && npm run build:electron"

echo "✅ Build complete!"
echo ""
echo "To run the Electron app:"
echo "1. Open Windows Terminal/PowerShell"
echo "2. Navigate to: $(wslpath -w $(pwd))"
echo "3. Run: cd electron && npm run dev"
echo ""
echo "Or if you have Node.js installed in WSL (may have issues):"
echo "   cd electron && NODE_ENV=development electron ."
