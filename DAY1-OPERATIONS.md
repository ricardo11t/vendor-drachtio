# 📅 Day 1 Operations Guide

After deployment, follow this guide to ensure everything is working correctly.

## ✅ First 1 Hour - Immediate Checks

### 1️⃣ SSH into VPS and Verify Connectivity (5 min)

```bash
# SSH into the VPS
ssh ubuntu@<YOUR_NEW_VPS_IP>

# Verify you can see the application
cd /opt/drachtio-vendor/vendor-drachtio

# Check containers are running
docker-compose -f docker-compose.prod.yml ps

# Expected output:
# NAME                        STATUS
# drachtio-server            Up (healthy)
# drachtio-redis             Up (healthy)
# drachtio-vendor-app        Up (healthy)
```

### 2️⃣ Verify Network Configuration (5 min)

```bash
# Check if SIP port is listening
nc -zv localhost 5060

# Expected: Connection successful

# Check firewall rules
sudo ufw status
# Should show:
# 5060/tcp         ALLOW  Anywhere
# 5060/udp         ALLOW  Anywhere
# 22/tcp           ALLOW  Anywhere
```

### 3️⃣ Check Backend Connectivity (5 min)

```bash
# View logs to see if backend is reachable
docker-compose -f docker-compose.prod.yml logs --tail=20 app

# Look for one of these lines:
# ✅ "Successfully registered 1 trunks"
# ❌ "Failed to fetch outbound trunks" (check backend URL)
```

### 4️⃣ Run First Backup (5 min)

```bash
bash /opt/drachtio-vendor/vendor-drachtio/backup.sh

# This creates a snapshot of your configuration
# Backup location: /opt/drachtio-vendor/vendor-drachtio/backups/
```

### 5️⃣ Start Continuous Monitoring (5 min)

```bash
# Start the monitoring dashboard in a separate terminal window
bash /opt/drachtio-vendor/vendor-drachtio/monitor.sh

# Leave this running to catch any issues in real-time
# Refreshes every 10 seconds by default
```

---

## ✅ First 2 Hours - Update Wavoip Configuration

### 1️⃣ Update SIP Trunk in Wavoip Console (5 min)

1. Log into your Wavoip account
2. Navigate to: **Settings → Trunks** (or similar)
3. Find your Drachtio SIP trunk (should be pointing to old IP: 100.25.218.14)
4. Update:
   - **SIP Server**: `<YOUR_NEW_VPS_IP>:5060`
   - **Keep all other settings the same**
5. Save changes
6. Wait 30-60 seconds for Wavoip to reconnect

### 2️⃣ Verify Registration (5 min)

```bash
# Watch for registration confirmation
docker-compose -f docker-compose.prod.yml logs -f app | head -50

# Look for lines like:
# "REGISTER sent to sipv2.wavoip.com"
# "Registration successful for Wavoip trunk"
# or
# "REGISTER response received: 200 OK"

# If you see failures, check:
# 1. BACKEND_URL is correct
# 2. OutboundTrunks exist in backend API
# 3. Credentials are correct
```

---

## ✅ First 4 Hours - Receive Test Call

### 1️⃣ Place Test Call (10 min)

1. Make a call to your Wavoip DID from any phone
2. Keep the call connected for 5-10 seconds
3. Hang up

### 2️⃣ Check Logs for Call Details (5 min)

```bash
# View logs to see call details
docker logs drachtio-vendor-app --tail=50

# You should see logs like:
# INVITE received from Wavoip
# DID: +1234567890
# 200 OK response sent
# Call routed to LiveKit Dispatch Rule
```

### 3️⃣ Verify Call in LiveKit (5 min)

1. Log into LiveKit dashboard
2. Check: **Active Rooms** or **Session History**
3. Verify:
   - Room was created with correct name
   - Agent joined the room
   - Media streams are flowing
   - Call duration is correct

---

## ✅ First 24 Hours - Stability Check

### 1️⃣ Monitor for Errors (Every 30 min, 24 hours total)

```bash
# Check for errors every 30 minutes
watch -n 1800 'docker logs drachtio-vendor-app --tail=20 | grep -i error'

# Or manually check periodically:
docker logs drachtio-vendor-app | grep -i error
```

### 2️⃣ Monitor Resource Usage (Every 1 hour)

```bash
# Check if memory or CPU is growing unexpectedly
docker stats

# Expected ranges:
# - CPU: <5% most of the time
# - Memory: 100-300 MB
# - If growing continuously, there may be a leak
```

### 3️⃣ Test Multiple Calls (Every 4 hours)

```bash
# Place additional test calls to ensure consistent behavior
# Place 3-5 test calls throughout the first 24 hours
# Each time, check logs for proper INVITE → 200 OK flow
```

### 4️⃣ Backup Configuration (At 12 hours and 24 hours)

```bash
# Create backups at regular intervals
bash /opt/drachtio-vendor/vendor-drachtio/backup.sh

# This preserves your configuration in case you need to rollback
```

---

## 📋 Daily Checklist (Do Every Day)

Create this as a cron job or do manually:

```bash
#!/bin/bash
# File: /opt/drachtio-vendor/daily-check.sh

echo "=== Daily Health Check ===" $(date)

# 1. Check containers are running
echo "Checking containers..."
docker-compose -f /opt/drachtio-vendor/vendor-drachtio/docker-compose.prod.yml ps

# 2. Check for errors
echo ""
echo "Checking for errors (last 100 logs)..."
docker logs drachtio-vendor-app --tail=100 | grep -i error | tail -5

# 3. Check resource usage
echo ""
echo "Resource usage..."
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# 4. Check backend connectivity
echo ""
echo "Checking backend connectivity..."
BACKEND=$(docker-compose -f /opt/drachtio-vendor/vendor-drachtio/docker-compose.prod.yml config 2>/dev/null | grep BACKEND_URL | cut -d= -f2)
if curl -s --max-time 3 "$BACKEND/health" > /dev/null; then
  echo "✅ Backend is reachable"
else
  echo "❌ Backend is NOT reachable: $BACKEND"
fi

# 5. Check last successful call
echo ""
echo "Last 5 successful calls:"
docker logs drachtio-vendor-app --tail=200 | grep "INVITE received" | tail -5

echo ""
echo "=== End of Report ===" $(date)
```

Make it executable and add to cron:
```bash
chmod +x /opt/drachtio-vendor/daily-check.sh

# Add to crontab (runs daily at 9 AM)
crontab -e
# Add line: 0 9 * * * /opt/drachtio-vendor/daily-check.sh >> /var/log/drachtio-daily-check.log 2>&1
```

---

## 🚨 Troubleshooting During First 24 Hours

### ❌ Issue: "Port 5060 not responding"

```bash
# Check if Drachtio is listening
sudo netstat -tulpn | grep 5060

# If nothing shows up:
docker logs drachtio-server

# If error, try restarting:
docker-compose -f docker-compose.prod.yml restart drachtio
```

### ❌ Issue: "Backend not reachable"

```bash
# Verify BACKEND_URL
docker-compose -f docker-compose.prod.yml config | grep BACKEND_URL

# Test the URL manually
curl -v https://your-backend-url/health

# If fails, check:
# 1. URL is correct
# 2. Backend is running
# 3. Network connectivity to backend
```

### ❌ Issue: "No INVITE received"

```bash
# Verify Wavoip has correct IP
# Check: Is your new IP correct in Wavoip settings?

# Verify firewall allows traffic
sudo ufw status | grep 5060

# Try manually calling the port from another machine
nc -zv <YOUR_NEW_VPS_IP> 5060
```

### ❌ Issue: "Containers won't start"

```bash
# See what error occurred
docker-compose -f docker-compose.prod.yml logs

# Try rebuilding from scratch
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up --build

# If still fails, check docker is running:
docker ps
```

---

## 📞 Communication Checklist

After deployment, communicate with relevant parties:

- [ ] **DevOps Team**: New VPS IP and access details
- [ ] **Wavoip Support**: Inform them of IP change if applicable
- [ ] **LiveKit Admin**: Verify Dispatch Rules are configured
- [ ] **Your Team**: Share access credentials and documentation
- [ ] **Monitoring Team**: Set up alerting for the new IP

---

## 📊 Performance Baseline

Record these values after first 24 hours of stable operation:

```
Baseline Metrics (First 24 Hours)
==================================

Average CPU Usage: _________%
Peak CPU Usage: _________%
Average Memory Usage: _________MB
Peak Memory Usage: _________MB

Number of Calls Received: _________
Failed Calls: _________
Success Rate: _________%

Errors/Warnings: _________
Backend Uptime: _________%
Drachtio Uptime: _________%

Notes:
______________________________________
______________________________________
______________________________________
```

Use these to detect future performance degradation.

---

## 🎓 Key Learnings for First Day

1. **Port 5060 is critical**: If it's not accessible, no calls will come in
2. **Backend connectivity is critical**: App needs to fetch trunk config
3. **Logs are your friend**: Check them frequently, especially when testing
4. **Backups are essential**: Create one immediately after successful deployment
5. **Monitor continuously**: First 24 hours are critical for catching issues
6. **Document everything**: Note any issues and how you resolved them

---

## ✅ Success Criteria for Day 1

By end of day 1, you should have:

- [x] ✅ VPS with all services running
- [x] ✅ Port 5060 accessible from internet
- [x] ✅ Wavoip trunks updated and registered
- [x] ✅ At least 3 successful test calls received
- [x] ✅ Logs showing proper INVITE → 200 OK flow
- [x] ✅ No critical errors in logs
- [x] ✅ Resource usage within expected ranges
- [x] ✅ Backup created and verified
- [x] ✅ Monitoring dashboard working
- [x] ✅ Team notified of new deployment

---

## 🎯 Next Steps (Day 2+)

1. **Set up automated monitoring**: Configure alerts for errors
2. **Establish logging**: Centralize logs to external service
3. **Schedule regular backups**: Daily or weekly backups
4. **Performance tuning**: Optimize based on first day metrics
5. **Disaster recovery plan**: Document how to quickly restore
6. **Load testing**: Test with multiple simultaneous calls
7. **Security hardening**: Review and strengthen security settings

---

## 📚 Documentation to Review

After Day 1, make sure to read:
- **QUICKREF.md** - Commands for daily operations
- **DEPLOY.md** - Full deployment guide
- **README-DEPLOYMENT.md** - Architecture and integration
- **docker-compose.prod.yml** - Configuration details

---

**🎉 Congratulations on successful Day 1! Keep monitoring and enjoying stable operations!**

Remember: The first 24 hours are critical. Keep a close eye on logs and be ready to rollback if needed.

Good luck! 🚀
