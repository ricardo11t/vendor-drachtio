#!/bin/bash

# Deploy script for Drachtio on new EC2 instance
# Usage: ./deploy.sh <BACKEND_URL>
# Example: ./deploy.sh https://my-backend-on-railway.up.railway.app

set -e

echo "🚀 Drachtio Deploy Script"
echo "========================"

if [ -z "$1" ]; then
  echo "❌ Error: Backend URL not provided"
  echo "Usage: ./deploy.sh <BACKEND_URL>"
  echo "Example: ./deploy.sh https://my-backend-on-railway.up.railway.app"
  exit 1
fi

BACKEND_URL=$1
REPO_URL="https://github.com/ricardo11t/vendor-backend-nestjs.git"
WORK_DIR="/opt/drachtio-vendor"

echo "📋 Configuration:"
echo "  Backend URL: $BACKEND_URL"
echo "  Work Dir: $WORK_DIR"
echo "  Repo: $REPO_URL"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
  echo "❌ Docker is not installed. Installing..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh
  rm get-docker.sh
  echo "✅ Docker installed"
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
  echo "❌ docker-compose is not installed. Installing..."
  sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
  echo "✅ docker-compose installed"
fi

# Create work directory
echo "📁 Creating work directory..."
sudo mkdir -p $WORK_DIR
cd $WORK_DIR

# Clone or update repository
if [ -d ".git" ]; then
  echo "📦 Updating repository..."
  git pull origin main || git pull origin develop || true
else
  echo "📦 Cloning repository..."
  git clone $REPO_URL .
fi

# Navigate to drachtio directory
cd vendor-drachtio

# Update docker-compose.prod.yml with actual backend URL
echo "⚙️ Configuring docker-compose.prod.yml..."
sed -i "s|https://seu-backend-na-railway.up.railway.app|$BACKEND_URL|g" docker-compose.prod.yml

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.prod.yml down 2>/dev/null || true

# Pull latest images
echo "📥 Pulling latest images..."
docker-compose -f docker-compose.prod.yml pull

# Start services
echo "🚀 Starting services..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 5

# Check health
echo "🏥 Checking service health..."
docker-compose -f docker-compose.prod.yml ps

# Show logs
echo ""
echo "📋 Recent logs:"
docker-compose -f docker-compose.prod.yml logs --tail=20 app

echo ""
echo "✅ Deploy completed!"
echo ""
echo "📍 Service URLs:"
echo "  - Drachtio: drachtio.org:9022"
echo "  - SIP: 100.25.218.14:5060"
echo "  - Redis: 172.20.0.3:6379"
echo ""
echo "📊 View logs:"
echo "  cd $WORK_DIR/vendor-drachtio"
echo "  docker-compose -f docker-compose.prod.yml logs -f app"
echo ""
echo "🛑 Stop services:"
echo "  cd $WORK_DIR/vendor-drachtio"
echo "  docker-compose -f docker-compose.prod.yml down"
