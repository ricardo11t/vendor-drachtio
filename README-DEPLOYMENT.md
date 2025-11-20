# 🚀 Drachtio Vendor - Production Deployment Guide

Production-ready SIP server for handling inbound calls from Wavoip, routing through LiveKit with AI-powered agent assistance.

## 📋 Quick Start (TL;DR)

### For a Brand New VPS:

```bash
# 1. SSH into new VPS
ssh ubuntu@<YOUR_NEW_VPS_IP>

# 2. Run VPS setup (installs Docker, Git, configures firewall)
curl -O https://raw.githubusercontent.com/ricardo11t/vendor-backend-nestjs/main/vendor-drachtio/setup-vps.sh
sudo bash setup-vps.sh

# 3. Edit configuration
nano /opt/drachtio-vendor/vendor-drachtio/docker-compose.prod.yml
# Update: BACKEND_URL and PUBLIC_IP

# 4. Deploy
cd /opt/drachtio-vendor/vendor-drachtio
bash deploy.sh https://seu-backend-on-railway.up.railway.app

# 5. Monitor
bash monitor.sh
```

### For Existing Drachtio Installation:

```bash
cd /opt/drachtio-vendor/vendor-drachtio
bash deploy.sh https://seu-backend-on-railway.up.railway.app
```

---

## 📁 Repository Structure

```
vendor-drachtio/
├── 📄 Documentation
│   ├── README.md              ← You are here
│   ├── DEPLOY.md              ← Detailed deployment guide
│   ├── CHECKLIST.md           ← Pre/post deployment checklist
│   ├── QUICKREF.md            ← Quick reference for commands
│   └── package.json           ← Node.js dependencies
│
├── 🚀 Deployment Scripts
│   ├── setup-vps.sh           ← VPS initial setup (DO THIS FIRST)
│   ├── deploy.sh              ← Automated deployment
│   ├── monitor.sh             ← Real-time monitoring
│   └── rollback.sh            ← Rollback to previous version
│
├── 🐳 Docker Configuration
│   ├── docker-compose.prod.yml ← Production configuration
│   ├── docker-compose.yaml     ← Local development
│   └── Dockerfile              ← App container definition
│
├── 💻 Application Code
│   ├── app.js                 ← Main entry point
│   └── lib/
│       ├── call-session.js    ← SIP call handling
│       ├── outbound-registration.js ← Trunk registration
│       └── ... (other modules)
│
└── 🧪 Testing
    └── test/
        └── ... (test scenarios and SIPp configs)
```

---

## 🎯 Architecture

```
┌─────────────┐
│   Wavoip    │  (Sends SIP INVITE for inbound DIDs)
└──────┬──────┘
       │ INVITE (UDP/TCP port 5060)
       ↓
┌─────────────────────────────────────────────────┐
│         Drachtio SIP Server (Port 5060)          │
│  - Listens for incoming INVITE from Wavoip       │
│  - Extracts DID from request URI                 │
│  - Responds with 200 OK + SDP                    │
└──────┬──────────────────────────────────────────┘
       │
       ├→ 200 OK Response (back to Wavoip)
       │
       └→ LiveKit Dispatch Rule
           (Creates room + routes to available agent)
           ↓
        ┌──────────────┐
        │   LiveKit    │
        │ Cloud SIP    │
        └──────────────┘
           ↓
        Agent handles call in AI-powered system
```

---

## 🔧 Configuration

### Environment Variables (in `docker-compose.prod.yml`)

**CRITICAL - Must Configure:**
```
BACKEND_URL=https://seu-backend-on-railway.up.railway.app
PUBLIC_IP=<YOUR_VPS_PUBLIC_IP>
```

**Optional (if using LiveKit Cloud directly):**
```
LIVEKIT_URL=wss://your-livekit-instance
LIVEKIT_KEY=your-api-key
LIVEKIT_SECRET=your-secret
```

### Firewall Requirements

Your VPS firewall MUST allow:
- **Port 5060 UDP** (SIP protocol)
- **Port 5060 TCP** (SIP protocol - alternative transport)
- **Port 22 TCP** (SSH - if you need access)

---

## 📊 Health Checks

### Container Health
```bash
docker-compose -f docker-compose.prod.yml ps

# Expected:
# NAME                STATUS
# drachtio-server    Up (healthy)
# drachtio-redis     Up (healthy)
# drachtio-vendor-app Up (healthy)
```

### Network Connectivity
```bash
# From outside VPS, test if port is open
nc -zv <YOUR_VPS_IP> 5060

# Expected: Connection successful
```

### Backend API Access
```bash
# App should log successful connection to backend
docker logs drachtio-vendor-app | grep -i "Successfully registered\|Failed to fetch"

# Expected: Successfully registered N trunks
```

### Live Call Test
```bash
# Monitor logs while receiving a call
docker-compose -f docker-compose.prod.yml logs -f app

# Expected logs:
# - INVITE received from Wavoip
# - DID extracted
# - 200 OK sent
# - Call routed to LiveKit Dispatch Rule
```

---

## 📜 Common Commands

### Deployment
```bash
# Deploy to fresh VPS (with setup)
sudo bash setup-vps.sh
bash deploy.sh https://backend-url

# Deploy to existing VPS
bash deploy.sh https://backend-url

# Redeploy current code
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

### Monitoring
```bash
# Real-time dashboard
bash monitor.sh

# View logs
docker-compose -f docker-compose.prod.yml logs -f app

# Check container status
docker-compose -f docker-compose.prod.yml ps

# View resource usage
docker stats
```

### Maintenance
```bash
# Restart services
docker-compose -f docker-compose.prod.yml restart app

# Stop services (gracefully)
docker-compose -f docker-compose.prod.yml down

# Rollback to previous version
bash rollback.sh

# Update code from git
git pull origin main
docker-compose -f docker-compose.prod.yml up -d --build
```

### Troubleshooting
```bash
# See all logs with timestamps
docker logs drachtio-vendor-app -t

# Search for errors
docker logs drachtio-vendor-app | grep -i error

# Check Drachtio connectivity
docker logs drachtio-vendor-app | grep -i drachtio

# Check backend connectivity
docker logs drachtio-vendor-app | grep -i backend

# Check SIP registration
docker logs drachtio-vendor-app | grep -i "register\|trunk"
```

---

## 🚨 Troubleshooting

| Symptom | Diagnosis | Solution |
|---------|-----------|----------|
| **Port 5060 not responding** | Firewall blocking or port not listening | `sudo ufw allow 5060/udp; sudo ufw allow 5060/tcp` |
| **Can't reach backend API** | BACKEND_URL misconfigured or API down | Check `docker-compose.prod.yml` BACKEND_URL; verify API is running |
| **Containers won't start** | Docker not running or config error | `docker logs <container>` to see error; check docker-compose.prod.yml syntax |
| **No trunks registered** | API not responding or auth fails | Check backend API `/sip/trunk/outbound` endpoint; verify credentials |
| **Calls not routing** | LiveKit Dispatch Rules not configured | Verify Dispatch Rules exist in LiveKit dashboard |
| **High memory usage** | Memory leak or too many calls | Monitor with `docker stats`; check logs for errors |

For detailed troubleshooting, see **DEPLOY.md** troubleshooting section.

---

## 📝 Important Files

### Must Read Before Deploying:
- **CHECKLIST.md** - Pre-deployment verification checklist
- **DEPLOY.md** - Comprehensive deployment guide
- **QUICKREF.md** - Quick reference for common commands

### Scripts:
- **setup-vps.sh** - Initial VPS setup (installs Docker, opens ports, etc.)
- **deploy.sh** - Automated deployment (clones repo, starts containers)
- **monitor.sh** - Real-time monitoring dashboard
- **rollback.sh** - Rollback to previous deployment

### Configuration:
- **docker-compose.prod.yml** - Main production configuration
- **Dockerfile** - Container build definition
- **package.json** - Node.js dependencies

---

## 🔐 Security Considerations

1. **DRACHTIO_SECRET**: Change from default `cymru` to a strong password
2. **Backend API**: Ensure BACKEND_URL is HTTPS (not HTTP)
3. **Credentials**: Never commit credentials to git
4. **Firewall**: Only open necessary ports (5060 for SIP, 22 for SSH)
5. **Secrets**: Use environment variables, not hardcoded values
6. **Updates**: Keep Docker images and packages updated

---

## 📞 Integration with Wavoip

### Registration Flow:
1. Drachtio app starts and fetches OutboundTrunks from backend
2. For each active trunk, it registers with Wavoip:
   - SIP REGISTER to `sipv2.wavoip.com`
   - With provided AuthUsername and AuthPassword
   - Contact header points back to `PUBLIC_IP:PUBLIC_SIP_PORT`
3. Wavoip accepts registration and routes inbound DIDs to registered IP

### Inbound Call Flow:
1. Wavoip receives call for your DID
2. Sends SIP INVITE to your `PUBLIC_IP:5060`
3. Drachtio receives INVITE and extracts DID
4. Responds with 200 OK + SDP for media
5. LiveKit Dispatch Rule creates room and routes to available agent

### Configuration Update:
When moving to new VPS:
1. Update `PUBLIC_IP` in `docker-compose.prod.yml` to new VPS IP
2. Wavoip will automatically re-register with new IP (or manually trigger)
3. DIDs now route to new VPS

---

## 🎓 Learning Resources

**Understanding SIP:**
- SIP is the protocol for voice calls
- INVITE = incoming call
- 200 OK = accepting the call
- ACK = acknowledgment
- BYE = hanging up

**Understanding Drachtio:**
- Drachtio is a SIP application server
- It receives and handles SIP requests
- Integrates with LiveKit for media

**Understanding LiveKit:**
- LiveKit handles the actual voice media
- Dispatch Rules route calls to agents
- We only handle SIP signaling, not media

---

## 📅 Maintenance Schedule

### Daily:
- Monitor logs for errors: `docker logs drachtio-vendor-app | grep -i error`
- Check container health: `docker-compose -f docker-compose.prod.yml ps`

### Weekly:
- Review resource usage: `docker stats`
- Check for updates: `git status`
- Test a live call from Wavoip

### Monthly:
- Update Docker images: `docker-compose -f docker-compose.prod.yml pull`
- Update code: `git pull`
- Review and archive logs

### As Needed:
- Restart service if issues: `docker-compose -f docker-compose.prod.yml restart app`
- Rollback if problems: `bash rollback.sh`

---

## 🤝 Support & Debugging

### Getting Help:
1. Check **DEPLOY.md** for detailed guide
2. Check **QUICKREF.md** for command reference
3. Check **CHECKLIST.md** for configuration validation
4. Review logs: `docker logs drachtio-vendor-app`
5. Test connectivity: `nc -zv <ip> 5060`

### Collecting Debug Info:
```bash
# Save all logs for analysis
docker logs drachtio-vendor-app > debug-logs.txt 2>&1

# Check configuration
docker-compose -f docker-compose.prod.yml config

# Check network
docker network inspect drachtio-drachtio-net
```

---

## 📦 Deployment History

After deployment, check:
```bash
# Deployment history
git log --oneline | head -10

# Current version
git describe --tags || git rev-parse --short HEAD

# Changes since deployment
git status
```

---

## 🎯 Success Criteria

Your deployment is successful when:

- [x] ✅ VPS created and SSH access confirmed
- [x] ✅ Docker and dependencies installed (setup-vps.sh)
- [x] ✅ Repository cloned to `/opt/drachtio-vendor`
- [x] ✅ `docker-compose.prod.yml` configured with correct IPs/URLs
- [x] ✅ All containers running and healthy (`docker ps`)
- [x] ✅ Port 5060 is open and responding (`nc -zv <ip> 5060`)
- [x] ✅ Backend API is reachable (check logs for "Successfully registered")
- [x] ✅ At least 1 test call from Wavoip succeeds
- [x] ✅ Logs show INVITE → 200 OK flow
- [x] ✅ Call is routed to LiveKit Dispatch Rule

---

## 🚀 Next Steps After Deployment

1. **Monitor for 24 hours**: Check logs regularly for errors
2. **Test with real calls**: Verify calls from Wavoip route correctly
3. **Set up alerting**: Configure monitoring notifications
4. **Document setup**: Note your specific IPs, URLs, and settings
5. **Backup configuration**: Save your docker-compose.prod.yml securely
6. **Plan updates**: Schedule regular code and security updates

---

## 📞 Version Info

- **Drachtio Version**: Latest (docker pull on each deploy)
- **Node.js Version**: 22-alpine
- **Docker**: Latest stable
- **Last Updated**: 2024
- **Status**: ✅ Production Ready

---

**🎉 You're all set! Deploy with confidence!**

For detailed information, see:
- **DEPLOY.md** - Comprehensive deployment guide
- **CHECKLIST.md** - Pre/post deployment verification
- **QUICKREF.md** - Common commands reference

Good luck! 🚀
