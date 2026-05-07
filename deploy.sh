#!/bin/bash

echo ""
echo "========================================="
echo "  M7-77 DEPLOYMENT SCRIPT"
echo "  Event-Driven Intelligence & Revenue Machine"
echo "========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

echo "✅ Docker found"
echo ""

# Build Docker image
echo "🔨 Building Docker image..."
docker build -t m7-77:latest .

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Docker image built successfully"
echo ""

# Stop any existing container
echo "🛑 Stopping any existing M7-77 containers..."
docker stop m7-77-production 2>/dev/null
docker rm m7-77-production 2>/dev/null

echo "✅ Previous containers cleaned"
echo ""

# Run the container
echo "🚀 Starting M7-77 in production mode..."
docker run -d \
  --name m7-77-production \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  --restart unless-stopped \
  m7-77:latest

if [ $? -ne 0 ]; then
    echo "❌ Failed to start container"
    exit 1
fi

echo "✅ M7-77 started successfully"
echo ""

# Wait for container to be ready
echo "⏳ Waiting for M7-77 to initialize (30 seconds)..."
sleep 30

# Check health
echo ""
echo "🏥 Checking system health..."
curl -s http://localhost:3000/api/system/health | head -20

echo ""
echo ""
echo "========================================="
echo "  ✅ M7-77 DEPLOYMENT COMPLETE"
echo "========================================="
echo ""
echo "📊 Dashboard:    http://localhost:3000/dashboard"
echo "🎛️  Control:      http://localhost:3000/control"
echo "📡 API:          http://localhost:3000/api"
echo ""
echo "🔍 View logs:    docker logs -f m7-77-production"
echo "⛔ Stop M7-77:    docker stop m7-77-production"
echo "🗑️  Remove:       docker rm m7-77-production"
echo ""
echo "🎯 Status: LIVE AND GENERATING REVENUE"
echo ""
