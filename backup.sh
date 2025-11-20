#!/bin/bash

# Backup and Archive Script
# Creates timestamped backups of critical configuration files
# Usage: bash backup.sh [destination_dir]

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
WORK_DIR="/opt/drachtio-vendor/vendor-drachtio"
BACKUP_DIR="${1:-./backups}"

echo "💾 Drachtio Backup Script"
echo "========================="
echo "Timestamp: $TIMESTAMP"
echo "Work Dir: $WORK_DIR"
echo "Backup Dir: $BACKUP_DIR"
echo ""

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

if [ ! -d "$WORK_DIR" ]; then
  echo "❌ Work directory not found: $WORK_DIR"
  exit 1
fi

cd "$WORK_DIR"

# ============================================================================
# 1. Backup docker-compose.prod.yml
# ============================================================================
echo "📄 Backing up docker-compose.prod.yml..."
cp docker-compose.prod.yml "$BACKUP_DIR/docker-compose.prod.yml.$TIMESTAMP"

# ============================================================================
# 2. Backup .env files (if they exist)
# ============================================================================
if [ -f ".env" ]; then
  echo "📄 Backing up .env..."
  cp .env "$BACKUP_DIR/.env.$TIMESTAMP"
else
  echo "⚠️  .env not found (this is OK if using docker-compose variables)"
fi

# ============================================================================
# 3. Export Docker configuration
# ============================================================================
echo "🐳 Exporting Docker configuration..."
docker-compose -f docker-compose.prod.yml config > "$BACKUP_DIR/docker-compose.resolved.$TIMESTAMP.yml" 2>/dev/null || true

# ============================================================================
# 4. Export current environment from running container
# ============================================================================
echo "🔧 Exporting container environment variables..."
docker inspect drachtio-vendor-app --format='{{json .Config.Env}}' | jq . > "$BACKUP_DIR/app-env.$TIMESTAMP.json" 2>/dev/null || true

# ============================================================================
# 5. Backup application logs
# ============================================================================
echo "📋 Backing up application logs..."
docker logs drachtio-vendor-app > "$BACKUP_DIR/app-logs.$TIMESTAMP.txt" 2>/dev/null || true

# ============================================================================
# 6. Export git information
# ============================================================================
echo "📦 Exporting git information..."
git log --oneline -n 20 > "$BACKUP_DIR/git-history.$TIMESTAMP.txt" 2>/dev/null || true
git status > "$BACKUP_DIR/git-status.$TIMESTAMP.txt" 2>/dev/null || true
git show-ref > "$BACKUP_DIR/git-refs.$TIMESTAMP.txt" 2>/dev/null || true

# ============================================================================
# 7. Create manifest file
# ============================================================================
echo "📑 Creating backup manifest..."
cat > "$BACKUP_DIR/MANIFEST.$TIMESTAMP.txt" << EOF
Backup Manifest
===============
Created: $(date)
Timestamp: $TIMESTAMP
Host: $(hostname)
Current Directory: $(pwd)
Work Directory: $WORK_DIR

Files Backed Up:
================

1. docker-compose.prod.yml.$TIMESTAMP
   - Production Docker Compose configuration
   - Critical for deployment

2. .env.$TIMESTAMP (if exists)
   - Environment variables
   - May contain secrets

3. docker-compose.resolved.$TIMESTAMP.yml
   - Resolved Docker configuration with all variables expanded
   - Useful for debugging

4. app-env.$TIMESTAMP.json
   - Current environment variables from running container
   - Snapshot of what's actually running

5. app-logs.$TIMESTAMP.txt
   - Application logs from drachtio-vendor-app container
   - Useful for debugging

6. git-history.$TIMESTAMP.txt
   - Last 20 git commits
   - Track what changed

7. git-status.$TIMESTAMP.txt
   - Current git status
   - Check for uncommitted changes

8. git-refs.$TIMESTAMP.txt
   - All git branches and tags

9. MANIFEST.$TIMESTAMP.txt
   - This file

Container Status at Backup Time:
================================
$(docker-compose -f docker-compose.prod.yml ps)

Resource Usage at Backup Time:
==============================
$(docker stats --no-stream 2>/dev/null || echo "Docker stats unavailable")

Current Git Branch:
===================
$(git branch --show-current 2>/dev/null || echo "Not a git repository")

Backend Connectivity Check:
===========================
BACKEND_URL: $(docker-compose -f docker-compose.prod.yml config 2>/dev/null | grep BACKEND_URL | head -1 || echo "Not found")

Notes:
======
- Keep backups in a safe location
- Regularly clean up old backups (older than 30 days)
- Never commit .env files to git
- Store sensitive .env files separately from version control

To Restore:
===========
1. cp docker-compose.prod.yml.$TIMESTAMP docker-compose.prod.yml
2. Update any environment variables if needed
3. docker-compose -f docker-compose.prod.yml up -d

EOF

# ============================================================================
# 8. Display summary
# ============================================================================
echo ""
echo "=========================================="
echo "✅ Backup Complete!"
echo "=========================================="
echo ""
echo "📁 Backup Location: $BACKUP_DIR"
echo ""
echo "📋 Files Created:"
ls -lh "$BACKUP_DIR"/*"$TIMESTAMP"* 2>/dev/null | awk '{print "   ", $9, "(" $5 ")"}'
echo ""

# ============================================================================
# 9. Cleanup old backups (older than 30 days)
# ============================================================================
echo "🧹 Cleaning up old backups (older than 30 days)..."
OLD_BACKUPS=$(find "$BACKUP_DIR" -maxdepth 1 -type f -mtime +30)
if [ -z "$OLD_BACKUPS" ]; then
  echo "   No old backups to remove"
else
  echo "   Removing old backups:"
  find "$BACKUP_DIR" -maxdepth 1 -type f -mtime +30 -exec rm {} \; -print | awk '{print "   Removed:", $0}'
fi

echo ""
echo "💡 Tips:"
echo "   - Store backups in multiple locations"
echo "   - Include date in restore notes"
echo "   - Never commit .env to git"
echo "   - Rotate backups every 30 days"
echo ""
echo "✅ Done!"
