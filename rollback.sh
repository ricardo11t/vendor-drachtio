#!/bin/bash

# Rollback script - restore previous deployment
# Usage: ./rollback.sh

set -e

WORK_DIR="/opt/drachtio-vendor/vendor-drachtio"

echo "🔄 Rolling back to previous deployment..."
echo "=========================================="

if [ ! -d "$WORK_DIR" ]; then
  echo "❌ Work directory not found: $WORK_DIR"
  exit 1
fi

cd $WORK_DIR

# Show current status
echo "📊 Current status:"
docker-compose -f docker-compose.prod.yml ps

# Save current state
echo "💾 Saving current state..."
mkdir -p backups
cp docker-compose.prod.yml backups/docker-compose.prod.yml.$(date +%s)

# Stop current services
echo "🛑 Stopping current services..."
docker-compose -f docker-compose.prod.yml down

# Revert to previous git state
echo "🔙 Reverting to previous git commit..."
git log --oneline | head -5
read -p "Enter commit hash to rollback to (or press Enter for HEAD~1): " COMMIT
COMMIT=${COMMIT:-HEAD~1}

git reset --hard $COMMIT
echo "✅ Git reverted to $COMMIT"

# Restart with previous code
echo "🚀 Restarting services with previous code..."
docker-compose -f docker-compose.prod.yml up -d

# Wait and check
sleep 5
echo "✅ Rollback completed!"

# Show new status
echo ""
echo "📊 New status:"
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "📋 Recent logs:"
docker-compose -f docker-compose.prod.yml logs --tail=10 app
