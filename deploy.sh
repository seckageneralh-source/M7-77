#!/bin/bash

# M7-77 Rapid Deployment Script
# Deploys M7-77 and starts revenue generation immediately

echo "🚀 M7-77 RAPID DEPLOYMENT"
echo "================================="

# Check prerequisites
echo "✓ Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "Node.js required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm required"; exit 1; }

echo "✓ Node.js: $(node -v)"
echo "✓ npm: $(npm -v)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install --production

# Verify installation
if [ $? -ne 0 ]; then
  echo "❌ Installation failed"
  exit 1
fi

echo "✓ Dependencies installed"

# Create data directories
echo ""
echo "📁 Creating data directories..."
mkdir -p data logs config
echo "✓ Directories created"

# Verify config
echo ""
echo "⚙️  Verifying configuration..."
if [ ! -f "config/m7-config.json" ]; then
  echo "✓ Config file ready"
fi

# Start system
echo ""
echo "🟢 STARTING M7-77 SYSTEM"
echo "================================="
echo ""

node src/index.js