#!/bin/bash

# Health monitoring script
# Usage: ./monitor.sh or ./monitor.sh <interval_seconds>
# Example: ./monitor.sh 5  (check every 5 seconds)

WORK_DIR="/opt/drachtio-vendor/vendor-drachtio"
INTERVAL=${1:-10}  # Default 10 seconds

if [ ! -d "$WORK_DIR" ]; then
  echo "❌ Work directory not found: $WORK_DIR"
  exit 1
fi

cd $WORK_DIR

clear

echo "🔍 Drachtio Health Monitor"
echo "=========================="
echo "Interval: ${INTERVAL}s | Press Ctrl+C to exit"
echo ""

while true; do
  clear
  echo "🔍 Drachtio Health Monitor"
  echo "=========================="
  echo "Interval: ${INTERVAL}s | Press Ctrl+C to exit | Last updated: $(date '+%H:%M:%S')"
  echo ""
  
  # Check containers
  echo "📦 Containers:"
  docker-compose -f docker-compose.prod.yml ps --format "table {{.Names}}\t{{.Status}}"
  echo ""
  
  # Check resource usage
  echo "💾 Resource Usage:"
  docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
  echo ""
  
  # Check recent logs
  echo "📋 Recent Logs (last 5):"
  docker-compose -f docker-compose.prod.yml logs --tail=5 app --no-log-prefix 2>/dev/null | tail -5
  echo ""
  
  # Check for errors
  echo "⚠️  Recent Errors:"
  ERRORS=$(docker-compose -f docker-compose.prod.yml logs --tail=50 app 2>/dev/null | grep -i "error\|failed\|refused" | tail -3)
  if [ -z "$ERRORS" ]; then
    echo "✅ No errors detected"
  else
    echo "$ERRORS"
  fi
  echo ""
  
  # Network check
  echo "🌐 Network Status:"
  if nc -zv localhost 5060 2>/dev/null; then
    echo "✅ SIP port (5060) is listening"
  else
    echo "❌ SIP port (5060) is NOT listening"
  fi
  echo ""
  
  # Backend connectivity
  echo "📡 Backend Connectivity:"
  BACKEND_URL=$(docker-compose -f docker-compose.prod.yml config | grep "BACKEND_URL" | head -1 | cut -d'=' -f2 | xargs)
  if [ ! -z "$BACKEND_URL" ]; then
    if curl -s --max-time 3 "$BACKEND_URL/health" > /dev/null 2>&1; then
      echo "✅ Backend API is reachable"
    else
      echo "❌ Backend API is NOT reachable"
      echo "   URL: $BACKEND_URL"
    fi
  else
    echo "⚠️  BACKEND_URL not configured"
  fi
  echo ""
  
  echo "Refreshing in ${INTERVAL}s..."
  sleep $INTERVAL
done
