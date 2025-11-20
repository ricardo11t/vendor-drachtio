# 📦 Complete Deployment Package Contents

This document describes all files created for production deployment of Drachtio.

---

## 📚 Documentation Files

### 1. **README-DEPLOYMENT.md** (Main Entry Point)
- **Purpose**: High-level overview of the entire deployment process
- **Who reads it**: Everyone - start here!
- **Contents**:
  - Quick start guide (TL;DR)
  - Architecture diagram
  - Common commands
  - Troubleshooting matrix
  - Integration with Wavoip

### 2. **DEPLOY.md** (Comprehensive Guide)
- **Purpose**: Step-by-step deployment instructions
- **Who reads it**: DevOps engineers doing the actual deployment
- **Contents**:
  - Pre-requisites checklist
  - SSH setup
  - Installation options (script vs manual)
  - Post-deployment verification
  - Detailed troubleshooting

### 3. **CHECKLIST.md** (Pre/Post Deployment Verification)
- **Purpose**: Ensure nothing is forgotten before and after deployment
- **Who reads it**: QA and DevOps team
- **Contents**:
  - 9 deployment phases
  - Configuration verification
  - Health checks
  - Success criteria

### 4. **QUICKREF.md** (Quick Command Reference)
- **Purpose**: Daily reference for common operations
- **Who reads it**: Operators and DevOps engineers
- **Contents**:
  - All essential commands
  - Locations of files
  - Troubleshooting quick fixes
  - Emergency procedures

### 5. **DAY1-OPERATIONS.md** (First Day Runbook)
- **Purpose**: Step-by-step guide for first day after deployment
- **Who reads it**: Operators during initial deployment
- **Contents**:
  - 1-hour checks
  - 2-hour verification
  - 4-hour test procedure
  - 24-hour monitoring schedule
  - Daily checklist template

---

## 🚀 Deployment Scripts

### 1. **setup-vps.sh** (VPS Initial Setup)
- **When to run**: FIRST - on brand new VPS
- **What it does**:
  - Updates system packages
  - Installs Docker and docker-compose
  - Installs Git and utilities
  - Configures UFW firewall
  - Opens SIP ports (5060)
  - Clones the repository
- **Usage**: `sudo bash setup-vps.sh`
- **Time**: ~5 minutes
- **Idempotent**: Yes (safe to run multiple times)

### 2. **deploy.sh** (Automated Deployment)
- **When to run**: SECOND - after setup-vps.sh or any update
- **What it does**:
  - Clones/updates repository
  - Builds Docker images
  - Starts containers
  - Waits for health checks
  - Shows logs
- **Usage**: `bash deploy.sh https://backend-url.up.railway.app`
- **Time**: ~2-3 minutes
- **Interactive**: No (fully automated)

### 3. **monitor.sh** (Real-Time Monitoring)
- **When to run**: ALWAYS - during and after deployment
- **What it does**:
  - Shows container status
  - Displays resource usage
  - Shows recent logs
  - Detects errors automatically
  - Checks network connectivity
- **Usage**: `bash monitor.sh` (or `bash monitor.sh 5` for 5-sec refresh)
- **Time**: Runs continuously (Ctrl+C to exit)
- **Interactive**: Yes (real-time dashboard)

### 4. **rollback.sh** (Emergency Rollback)
- **When to run**: ONLY if something goes wrong
- **What it does**:
  - Stops current containers
  - Reverts git to previous commit
  - Restarts with previous code
  - Provides rollback options
- **Usage**: `bash rollback.sh`
- **Time**: ~1 minute
- **Interactive**: Yes (asks which commit to restore)

### 5. **backup.sh** (Configuration Backup)
- **When to run**: After successful deployment and periodically
- **What it does**:
  - Backs up docker-compose.prod.yml
  - Exports Docker config
  - Saves application logs
  - Creates git history snapshot
  - Generates manifest file
  - Auto-cleans old backups (30+ days)
- **Usage**: `bash backup.sh` or `bash backup.sh /path/to/backups`
- **Time**: <1 minute
- **Output**: Timestamped files in `backups/` directory

---

## 🐳 Docker Configuration Files

### 1. **docker-compose.prod.yml** (Production Configuration)
- **Purpose**: Main production deployment configuration
- **Key sections**:
  - Drachtio service (SIP server, port 5060)
  - Redis service (state management)
  - App service (Node.js application)
- **Critical environment variables**:
  - `BACKEND_URL` - Must point to your Railway backend
  - `PUBLIC_IP` - Must be your VPS public IP
  - `DRACHTIO_SECRET` - Change from default for security
- **Networks**: Custom bridge network (drachtio-net)
- **Health checks**: All services have health checks configured
- **Restart policy**: Services restart on failure

### 2. **Dockerfile** (Already Exists)
- **Base image**: node:22-alpine
- **What it does**:
  - Installs npm dependencies
  - Copies application code
  - Sets up working directory
  - Exposes port 3000 (health check)
- **No changes needed**: This is already optimized

---

## 💻 Application Files (Already Exist)

### Core Application:
- **app.js** - Main entry point
- **lib/call-session.js** - Handles SIP calls
- **lib/outbound-registration.js** - Registers trunks with Wavoip
- **package.json** - Dependencies

---

## 📊 File Organization in Workspace

```
vendor-drachtio/
│
├── 📄 DOCUMENTATION (Read These)
│   ├── README-DEPLOYMENT.md     ← Start here
│   ├── DEPLOY.md                ← Detailed guide
│   ├── CHECKLIST.md             ← Verification checklist
│   ├── QUICKREF.md              ← Command reference
│   ├── DAY1-OPERATIONS.md       ← First day runbook
│   └── PACKAGES.md              ← This file
│
├── 🚀 DEPLOYMENT SCRIPTS (Run These)
│   ├── setup-vps.sh             ← Run 1st (Ubuntu setup)
│   ├── deploy.sh                ← Run 2nd (Deploy app)
│   ├── monitor.sh               ← Run 3rd (Monitor)
│   ├── rollback.sh              ← Emergency use only
│   └── backup.sh                ← Regular backups
│
├── 🐳 DOCKER CONFIGURATION
│   ├── docker-compose.prod.yml  ← Production config (EDIT THIS!)
│   ├── docker-compose.yaml      ← Development (for reference)
│   └── Dockerfile               ← Container image definition
│
├── 💻 APPLICATION CODE
│   ├── app.js
│   ├── package.json
│   └── lib/
│       ├── call-session.js
│       ├── outbound-registration.js
│       └── ... (other modules)
│
├── 📁 BACKUPS (Auto-generated)
│   ├── docker-compose.prod.yml.TIMESTAMP
│   ├── app-logs.TIMESTAMP.txt
│   ├── MANIFEST.TIMESTAMP.txt
│   └── ... (other backups)
│
└── 🧪 TESTING
    └── test/
        └── ... (test scenarios)
```

---

## 📋 Reading Order (First Time)

### For Quick Deploy (30 min):
1. README-DEPLOYMENT.md (Quick Start section)
2. setup-vps.sh (run)
3. deploy.sh (run)
4. monitor.sh (run and watch)

### For Complete Understanding (2 hours):
1. README-DEPLOYMENT.md (full read)
2. DEPLOY.md (full read)
3. CHECKLIST.md (go through each section)
4. QUICKREF.md (bookmark for later)
5. docker-compose.prod.yml (review configuration)

### For Day 1 Operations (first 24 hours):
1. DAY1-OPERATIONS.md (follow step by step)
2. QUICKREF.md (reference as needed)
3. monitor.sh (keep running)
4. backup.sh (run after success)

### For Ongoing Operations (daily):
1. QUICKREF.md (reference only)
2. monitor.sh (daily check)
3. backup.sh (weekly)

---

## 🔧 Pre-Deployment Checklist

Before running scripts:

- [ ] Have new VPS IP address ready
- [ ] Have backend URL (Railway) ready
- [ ] Have SSH access to VPS configured
- [ ] Have git credential ready (if private repo)
- [ ] Have Wavoip credentials ready (to update)
- [ ] Read DEPLOY.md pre-requisites section
- [ ] Read CHECKLIST.md phase 1-2

---

## ⚡ Quick Deploy (TL;DR)

```bash
# 1. On new VPS
sudo bash setup-vps.sh

# 2. After setup completes
cd /opt/drachtio-vendor/vendor-drachtio
bash deploy.sh https://your-backend-on-railway.up.railway.app

# 3. Monitor (keep this running)
bash monitor.sh

# 4. Once healthy, make backup
bash backup.sh

# 5. Update Wavoip with new IP and test
```

---

## 🎯 Success Criteria

After deployment, you should have:

- ✅ All services healthy (docker ps shows "Up (healthy)")
- ✅ Port 5060 responding (nc -zv <ip> 5060)
- ✅ Backend reachable (logs show "Successfully registered")
- ✅ At least 1 successful test call
- ✅ Wavoip pointing to new IP
- ✅ Backup created and verified
- ✅ No critical errors in logs

---

## 📞 When Something Goes Wrong

1. **Check QUICKREF.md** "Troubleshooting" section first
2. **View logs**: `docker logs drachtio-vendor-app`
3. **Check configuration**: `docker-compose config`
4. **Run monitor.sh** to see real-time status
5. **If still broken**: `bash rollback.sh` to go back to previous version
6. **After rollback**: Fix issue and try again

---

## 🔐 Security Notes

- ⚠️ **Change DRACHTIO_SECRET** from default "cymru" to strong password
- ⚠️ **Use HTTPS for BACKEND_URL** (not HTTP)
- ⚠️ **Never commit credentials** to git
- ⚠️ **Keep firewall strict** - only open needed ports
- ⚠️ **Rotate credentials** regularly
- ⚠️ **Review logs** for suspicious activity

---

## 📈 Deployment Statistics

| Aspect | Details |
|--------|---------|
| **Total Setup Time** | 10-15 minutes |
| | (5 min setup, 2-3 min deploy, 3-5 min monitoring) |
| **Docker image size** | ~200MB |
| **RAM required** | 2GB minimum |
| **Disk required** | 20GB minimum |
| **Network ports** | 5060 (SIP), 9022 (Drachtio), 6379 (Redis) |
| **Security** | UFW firewall configured |

---

## 🎓 Learning Resources Included

- Architecture diagram (in README-DEPLOYMENT.md)
- SIP call flow explanation (in DEPLOY.md)
- Command explanations (in QUICKREF.md)
- Step-by-step guide (in DAY1-OPERATIONS.md)

---

## 📦 Dependency Versions

Installed automatically:

- **Docker**: Latest stable
- **Node.js**: 22-alpine
- **Drachtio**: Latest (pulled at deploy)
- **Redis**: 7-alpine
- **npm packages**: See package.json

---

## 🆘 Emergency Commands

If you get stuck:

```bash
# Check what's actually running
docker ps

# See all logs
docker logs drachtio-vendor-app | head -100

# Stop everything (safe)
docker-compose -f docker-compose.prod.yml down

# Start everything fresh
docker-compose -f docker-compose.prod.yml up -d

# Go back to previous version
bash rollback.sh

# Contact support with logs attached
docker logs drachtio-vendor-app > support-logs.txt
```

---

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024 | Initial production release |
| | | - setup-vps.sh for zero-to-hero setup |
| | | - deploy.sh for automated deployment |
| | | - Complete documentation |
| | | - Backup and monitoring scripts |

---

## 🎉 You're All Set!

All the documentation and scripts needed for production deployment are included. Start with:

```bash
sudo bash setup-vps.sh
bash deploy.sh https://your-backend-url
bash monitor.sh
```

Then follow DAY1-OPERATIONS.md for the first 24 hours.

**Good luck! 🚀**

For questions, refer to:
- DEPLOY.md for detailed procedures
- QUICKREF.md for command reference
- DAY1-OPERATIONS.md for first day guide
