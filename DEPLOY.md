# 📋 Deploy Instructions for New VPS

## Pre-requisites

- [ ] New EC2/VPS instance created and running
- [ ] Ubuntu 22.04 LTS (or compatible)
- [ ] SSH access to the instance
- [ ] New VPS public IP address
- [ ] Backend URL (Railway deployment)
- [ ] Wavoip credentials ready to update

## Step 1: SSH into New VPS

```bash
ssh -i your-key.pem ubuntu@<NEW_VPS_IP>

# Or if using password auth:
ssh ubuntu@<NEW_VPS_IP>
```

## Step 2: Get Deploy Script

Option A - Clone entire repo:
```bash
git clone https://github.com/ricardo11t/vendor-backend-nestjs.git
cd vendor-backend-nestjs/vendor-drachtio
bash deploy.sh https://your-backend-on-railway.up.railway.app
```

Option B - Download just the deploy script:
```bash
cd /tmp
wget https://raw.githubusercontent.com/ricardo11t/vendor-backend-nestjs/main/vendor-drachtio/deploy.sh
bash deploy.sh https://your-backend-on-railway.up.railway.app
```

Option C - Manual setup (if script has issues):
```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin git

git clone https://github.com/ricardo11t/vendor-backend-nestjs.git /opt/drachtio-vendor
cd /opt/drachtio-vendor/vendor-drachtio

# Edit docker-compose.prod.yml and set your BACKEND_URL
nano docker-compose.prod.yml

# Start services
docker-compose -f docker-compose.prod.yml up -d
```

## Step 3: Verify Deployment

```bash
cd /opt/drachtio-vendor/vendor-drachtio

# Check if containers are running
docker-compose -f docker-compose.prod.yml ps

# Expected output:
# NAME                COMMAND             STATUS
# drachtio.org        "/drachtio/bin/..."  Up
# drachtio-vendor-app "node app.js"        Up

# View logs
docker-compose -f docker-compose.prod.yml logs -f app

# Expected logs:
# Connected to drachtio listening on tcp
# Ready to receive SIP calls - routing to LiveKit
# Fetching outbound trunks from backend
# (success or error - both are OK)
```

## Step 4: Test Connectivity

```bash
# Test SIP port (5060) is open
nmap -p 5060 <NEW_VPS_IP>

# Or from your local machine:
nc -zv <NEW_VPS_IP> 5060

# Should show: Connection successful
```

## Step 5: Configure Wavoip

In Wavoip settings, update your SIP trunk configuration:

**OLD:**
- SIP Host: 100.25.218.14:5060  (old VPS)

**NEW:**
- SIP Host: <NEW_VPS_IP>:5060

Save and test.

## Step 6: Monitor Live Calls

```bash
cd /opt/drachtio-vendor/vendor-drachtio

# Watch logs in real-time
docker-compose -f docker-compose.prod.yml logs -f app

# When a call comes in, you should see:
# INVITE received from Wavoip
# DID extracted
# 200 OK sent
# Call routed to LiveKit Dispatch Rule
```

## Troubleshooting

### Issue: "Docker not found"
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
```

### Issue: "Connection refused on port 5060"
```bash
# Check if port is open
sudo ufw allow 5060/udp
sudo ufw allow 5060/tcp
sudo ufw enable

# Restart app
docker-compose -f docker-compose.prod.yml restart app
```

### Issue: "Cannot connect to backend API"
```bash
# Verify backend URL in docker-compose.prod.yml
docker-compose -f docker-compose.prod.yml config | grep BACKEND_URL

# Test connectivity
curl https://your-backend-on-railway.up.railway.app/health

# Check app logs
docker-compose -f docker-compose.prod.yml logs app | grep -i backend
```

### Issue: "Trunk registration failed"
```bash
# Verify trunks exist in backend
curl https://your-backend-on-railway.up.railway.app/sip/trunk/outbound

# Check app logs for details
docker-compose -f docker-compose.prod.yml logs app | grep -i trunk
```

## Useful Commands

```bash
# View all containers
docker ps -a

# View specific service logs
docker logs drachtio-vendor-app -f --tail=50

# Stop services (gracefully)
docker-compose -f docker-compose.prod.yml down

# Stop and remove all data
docker-compose -f docker-compose.prod.yml down -v

# Restart a service
docker-compose -f docker-compose.prod.yml restart app

# View resource usage
docker stats

# View container details
docker inspect drachtio-vendor-app
```

## Network Architecture

```
Internet (Wavoip)
    |
    | INVITE (SIP)
    ↓
[NEW_VPS_IP]:5060 (Drachtio)
    |
    ├→ 200 OK response (SIP)
    |
    └→ Live media via Dispatch Rule
```

## Environment Variables (Pre-configured in docker-compose.prod.yml)

If you need to manually adjust:

```bash
# Edit docker-compose.prod.yml
BACKEND_URL=https://your-backend.up.railway.app
DRACHTIO_HOST=0.0.0.0           # Listen on all interfaces
DRACHTIO_PORT=9022              # Internal Drachtio control port
PUBLIC_SIP_PORT=5060            # External SIP port
LIVEKIT_URL=your-livekit-url
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-secret
```

## Post-Deployment Checklist

- [ ] VPS instance created and running
- [ ] SSH access confirmed
- [ ] Docker/docker-compose installed
- [ ] Repository cloned
- [ ] BACKEND_URL configured
- [ ] Services started (`docker-compose up -d`)
- [ ] Services healthy (`docker ps`)
- [ ] Port 5060 open (UFW rule added if applicable)
- [ ] Wavoip trunk updated with new IP
- [ ] Test call received and logged
- [ ] Logs monitored for errors

## Support

Check logs for specific errors:
```bash
docker-compose -f docker-compose.prod.yml logs app | grep -i error
```

Most common issues are:
1. **Backend URL wrong** → Check `docker-compose.prod.yml` BACKEND_URL
2. **Port 5060 closed** → Check firewall rules
3. **Services not starting** → Check `docker logs <container>`
4. **Trunk registration failing** → Verify backend API is responding
