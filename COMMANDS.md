# 📋 Essential Commands Cheat Sheet

Quick reference for all essential commands during and after deployment.

---

## 🚀 Deployment Commands (In Order)

### 1. SSH into VPS
```bash
ssh ubuntu@<YOUR_NEW_VPS_IP>
```

### 2. Download setup script
```bash
curl -O https://raw.githubusercontent.com/ricardo11t/vendor-backend-nestjs/main/vendor-drachtio/setup-vps.sh
```

### 3. Run VPS setup (installs Docker, opens ports)
```bash
sudo bash setup-vps.sh
# Time: ~5 minutes
# Output: All Docker setup complete
```

### 4. Navigate to app directory
```bash
cd /opt/drachtio-vendor/vendor-drachtio
```

### 5. Deploy application
```bash
bash deploy.sh https://your-backend-on-railway.up.railway.app
# Time: ~2-3 minutes
# Output: Services started and healthy
```

### 6. Monitor services (keep running)
```bash
bash monitor.sh
# Ctrl+C to exit
# Shows: Container status, logs, errors, health
```

### 7. Create backup (after all looks good)
```bash
bash backup.sh
# Time: <1 minute
# Output: Backup files created in backups/
```

---

## 📊 Verification Commands

### Check if containers are running
```bash
docker-compose -f docker-compose.prod.yml ps

# Expected output:
# NAME              STATUS
# drachtio-server   Up (healthy)
# drachtio-redis    Up (healthy)
# drachtio-vendor-app Up (healthy)
```

### Check if port 5060 is responding
```bash
nc -zv localhost 5060

# Expected: Connection successful
```

### Check backend connectivity
```bash
docker logs drachtio-vendor-app | grep -i "successfully registered\|failed to fetch"

# Expected: Successfully registered N trunks
```

### View latest logs
```bash
docker logs drachtio-vendor-app --tail=20

# or with timestamps:
docker logs drachtio-vendor-app -t --tail=20
```

### View logs in real-time
```bash
docker-compose -f docker-compose.prod.yml logs -f app
```

### Check resource usage
```bash
docker stats

# Shows CPU, memory, network usage
```

---

## 🔧 Configuration Commands

### View current docker-compose configuration
```bash
docker-compose -f docker-compose.prod.yml config
```

### View specific environment variable
```bash
docker-compose -f docker-compose.prod.yml config | grep BACKEND_URL
```

### View all environment variables of running container
```bash
docker inspect drachtio-vendor-app | grep -A 30 "\"Env\""
```

### Edit docker-compose.prod.yml
```bash
nano /opt/drachtio-vendor/vendor-drachtio/docker-compose.prod.yml

# Or with your preferred editor:
vim /opt/drachtio-vendor/vendor-drachtio/docker-compose.prod.yml
```

---

## 🛠️ Maintenance Commands

### Restart app service only (keeps drachtio)
```bash
docker-compose -f docker-compose.prod.yml restart app
```

### Restart all services
```bash
docker-compose -f docker-compose.prod.yml restart
```

### Stop all services (gracefully)
```bash
docker-compose -f docker-compose.prod.yml down
```

### Stop all and remove volumes (clean slate)
```bash
docker-compose -f docker-compose.prod.yml down -v
```

### Start services again
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Rebuild and restart (after code changes)
```bash
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

### Update to latest code
```bash
git pull origin main
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## 🚨 Emergency Commands

### View all errors in logs
```bash
docker logs drachtio-vendor-app | grep -i error
```

### View last 100 lines of logs
```bash
docker logs drachtio-vendor-app --tail=100
```

### Save all logs to file
```bash
docker logs drachtio-vendor-app > /tmp/app-logs.txt
```

### Rollback to previous version
```bash
bash /opt/drachtio-vendor/vendor-drachtio/rollback.sh
```

### See git history of changes
```bash
cd /opt/drachtio-vendor/vendor-drachtio
git log --oneline | head -10
```

### Force stop problematic container
```bash
docker kill drachtio-vendor-app
docker-compose -f docker-compose.prod.yml up -d
```

### Remove all old Docker images
```bash
docker image prune -a

# Or if you want to keep some:
docker image prune
```

### Check disk space
```bash
df -h

# If low on space, clean up Docker:
docker system prune -a
```

---

## 🧪 Testing Commands

### Test SIP port from outside
```bash
# From another machine:
nc -zv <YOUR_VPS_IP> 5060

# Expected: Connection successful
```

### Test backend API connectivity
```bash
curl https://your-backend-url/health

# Expected: {"status":"ok"} or similar
```

### Get outbound trunks from API
```bash
curl https://your-backend-url/sip/trunk/outbound | jq .

# Expected: JSON array of trunks
```

### Check if Drachtio is listening
```bash
sudo netstat -tulpn | grep 5060

# Expected: Entries for port 5060
```

---

## 📁 File Operations

### List all backup files
```bash
ls -lah /opt/drachtio-vendor/vendor-drachtio/backups/
```

### Create a backup
```bash
bash /opt/drachtio-vendor/vendor-drachtio/backup.sh

# or with custom location:
bash /opt/drachtio-vendor/vendor-drachtio/backup.sh /path/to/backups
```

### View backup manifest
```bash
cat /opt/drachtio-vendor/vendor-drachtio/backups/MANIFEST.<timestamp>.txt
```

### Restore from backup (manual)
```bash
# Copy backup to production
cp /opt/drachtio-vendor/vendor-drachtio/backups/docker-compose.prod.yml.<timestamp> \
   /opt/drachtio-vendor/vendor-drachtio/docker-compose.prod.yml

# Restart services
docker-compose -f docker-compose.prod.yml restart
```

---

## 🔐 Security Commands

### Check firewall rules
```bash
sudo ufw status
```

### Open SIP ports
```bash
sudo ufw allow 5060/udp
sudo ufw allow 5060/tcp
```

### View listening ports
```bash
sudo ss -tulpn | grep LISTEN

# or:
sudo netstat -tulpn | grep LISTEN
```

### Check running processes
```bash
docker ps -a
```

---

## 📈 Monitoring Commands

### Start real-time monitoring dashboard
```bash
bash /opt/drachtio-vendor/vendor-drachtio/monitor.sh

# With custom refresh interval (in seconds):
bash /opt/drachtio-vendor/vendor-drachtio/monitor.sh 5
```

### Watch docker stats continuously
```bash
watch docker stats
```

### Check memory usage over time
```bash
while true; do echo $(date): $(docker stats --no-stream | tail -1); sleep 60; done
```

### Monitor specific container
```bash
docker stats drachtio-vendor-app
```

---

## 🔍 Debugging Commands

### Get detailed container info
```bash
docker inspect drachtio-vendor-app
```

### View container network
```bash
docker network inspect drachtio-drachtio-net
```

### Check container's system logs
```bash
docker logs drachtio-vendor-app --since 1h

# or since specific time:
docker logs drachtio-vendor-app --since 2024-01-15T10:00:00
```

### Execute command in running container
```bash
docker exec -it drachtio-vendor-app bash

# or run a specific command:
docker exec drachtio-vendor-app ps aux
```

### Check if specific port is open
```bash
sudo lsof -i :5060

# Alternative:
sudo netstat -tulpn | grep :5060
```

---

## 📊 Performance Tuning

### Increase resource limits (if needed)
```bash
# Edit docker-compose.prod.yml and add:
# services:
#   app:
#     deploy:
#       resources:
#         limits:
#           cpus: '0.5'
#           memory: 512M
```

### View container resource limits
```bash
docker inspect drachtio-vendor-app | grep -A 10 "Memory"
```

---

## 🔗 Git Commands

### Check git status
```bash
cd /opt/drachtio-vendor/vendor-drachtio
git status
```

### See recent commits
```bash
git log --oneline | head -10
```

### View what changed in last commit
```bash
git show HEAD
```

### Stash uncommitted changes
```bash
git stash
```

### Create a new branch (for testing)
```bash
git checkout -b feature/my-feature
```

### Merge changes back
```bash
git checkout main
git merge feature/my-feature
```

---

## 🎯 Daily Operations Checklist

Run these daily:

```bash
# 1. Check if all containers are healthy
docker-compose -f docker-compose.prod.yml ps

# 2. Check for errors in last 100 logs
docker logs drachtio-vendor-app --tail=100 | grep -i error

# 3. Check resource usage
docker stats --no-stream

# 4. Check backend connectivity
curl -s https://your-backend-url/health && echo "OK" || echo "FAILED"

# 5. View last successful calls (if any)
docker logs drachtio-vendor-app --tail=50 | grep -i "invite received"
```

---

## 🎓 Command Explanations

### What does this do?
```bash
docker-compose -f docker-compose.prod.yml ps
# Shows status of all containers defined in docker-compose.prod.yml
```

### Check logs for errors
```bash
docker logs <container> | grep -i error
# Pipes logs through grep to find lines with "error" (case-insensitive)
```

### Run command in background
```bash
docker logs drachtio-vendor-app -f &
# The & puts the command in background so you can continue typing
```

### Run multiple commands
```bash
docker ps && docker stats --no-stream
# The && means "run second command if first succeeds"
```

---

## 📞 Quick Problem Solving

**Problem: Port not responding**
```bash
sudo ufw allow 5060/udp
sudo ufw allow 5060/tcp
docker-compose -f docker-compose.prod.yml restart drachtio
```

**Problem: Can't reach backend**
```bash
# Check URL
docker-compose -f docker-compose.prod.yml config | grep BACKEND_URL

# Test URL
curl -v https://your-backend-url/health
```

**Problem: Container crashed**
```bash
docker logs drachtio-vendor-app --tail=50
# Look for error messages
```

**Problem: Disk full**
```bash
df -h
docker system prune -a
```

**Problem: Something broken**
```bash
bash /opt/drachtio-vendor/vendor-drachtio/rollback.sh
```

---

## 🎉 You Have Everything You Need!

Copy this cheat sheet and refer to it whenever you need a command.

**Most used commands:**
- `bash monitor.sh` - See what's happening
- `docker logs drachtio-vendor-app` - Troubleshoot issues
- `bash backup.sh` - Protect your config
- `bash rollback.sh` - Emergency recovery

**Keep this bookmarked for daily operations!**
