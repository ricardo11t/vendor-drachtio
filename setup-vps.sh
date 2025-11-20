#!/bin/bash

# VPS Setup Script - Prepara uma nova VPS Ubuntu 22.04 para Drachtio
# Run this FIRST before running deploy.sh
# Usage: bash setup-vps.sh

set -e

echo "🚀 Drachtio VPS Setup Script"
echo "============================"
echo ""
echo "This script will:"
echo "  1. Update system packages"
echo "  2. Install Docker and Docker Compose"
echo "  3. Install Git"
echo "  4. Configure firewall"
echo "  5. Clone the repository"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  exit 1
fi

# Check if running as sudo
if [[ $EUID -ne 0 ]]; then
  echo "❌ This script must be run as root (use: sudo bash setup-vps.sh)"
  exit 1
fi

# ============================================================================
# 1. Update system
# ============================================================================
echo ""
echo "📦 Step 1: Updating system packages..."
apt-get update
apt-get upgrade -y

# ============================================================================
# 2. Install required tools
# ============================================================================
echo ""
echo "📦 Step 2: Installing required tools..."
apt-get install -y \
  curl \
  wget \
  git \
  htop \
  net-tools \
  netcat \
  nmap \
  vim \
  nano \
  build-essential \
  apt-transport-https \
  ca-certificates \
  gnupg \
  lsb-release

# ============================================================================
# 3. Install Docker
# ============================================================================
echo ""
echo "🐳 Step 3: Installing Docker..."

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Set up Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt-get update
apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-compose-plugin

# Add current user to docker group (so we don't need sudo for docker commands)
usermod -aG docker ${SUDO_USER:-ubuntu}

# Start Docker
systemctl start docker
systemctl enable docker

echo "✅ Docker installed and enabled"

# ============================================================================
# 4. Install Docker Compose (legacy)
# ============================================================================
echo ""
echo "🐳 Step 4: Installing Docker Compose (legacy)..."

curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

echo "✅ Docker Compose installed"

# ============================================================================
# 5. Configure Firewall
# ============================================================================
echo ""
echo "🔒 Step 5: Configuring UFW Firewall..."

# Enable UFW
ufw --force enable

# Allow SSH (IMPORTANT - don't lock yourself out!)
ufw allow 22/tcp

# Allow SIP ports (CRITICAL for Drachtio)
ufw allow 5060/udp
ufw allow 5060/tcp
ufw allow 5061/tcp

# Allow HTTP/HTTPS (for Let's Encrypt, if needed)
ufw allow 80/tcp
ufw allow 443/tcp

echo "✅ Firewall configured"
echo "   Allowed ports: 22, 80, 443, 5060 (UDP/TCP), 5061 (TCP)"

# ============================================================================
# 6. Clone repository
# ============================================================================
echo ""
echo "📦 Step 6: Cloning repository..."

WORK_DIR="/opt/drachtio-vendor"
mkdir -p $WORK_DIR
cd $WORK_DIR

if [ -d ".git" ]; then
  echo "Repository already exists, updating..."
  git pull origin main || git pull origin develop || true
else
  echo "Cloning repository..."
  git clone https://github.com/ricardo11t/vendor-backend-nestjs.git .
fi

cd vendor-drachtio

# ============================================================================
# 7. Make scripts executable
# ============================================================================
echo ""
echo "🔧 Step 7: Making scripts executable..."
chmod +x deploy.sh monitor.sh rollback.sh

echo "✅ Scripts are executable"

# ============================================================================
# 8. Create app directory for future logs
# ============================================================================
echo ""
echo "📁 Step 8: Creating application directories..."
mkdir -p /opt/drachtio-vendor/logs
mkdir -p /opt/drachtio-vendor/backups

# ============================================================================
# 9. Summary and Next Steps
# ============================================================================
echo ""
echo "=========================================="
echo "✅ VPS Setup Complete!"
echo "=========================================="
echo ""
echo "📍 Repository location:"
echo "   $WORK_DIR"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Configure docker-compose.prod.yml with your settings:"
echo "   nano /opt/drachtio-vendor/vendor-drachtio/docker-compose.prod.yml"
echo "   Update:"
echo "     - BACKEND_URL: https://seu-backend-on-railway.up.railway.app"
echo "     - PUBLIC_IP: <YOUR_VPS_IP>"
echo ""
echo "2. Run deployment script:"
echo "   cd $WORK_DIR/vendor-drachtio"
echo "   bash deploy.sh https://seu-backend-on-railway.up.railway.app"
echo ""
echo "3. Monitor deployment:"
echo "   bash /opt/drachtio-vendor/vendor-drachtio/monitor.sh"
echo ""
echo "4. View logs:"
echo "   docker-compose -f docker-compose.prod.yml logs -f app"
echo ""
echo "5. Update Wavoip SIP trunk to point to:"
echo "   <YOUR_VPS_IP>:5060"
echo ""
echo "💡 Tips:"
echo "   - Use 'docker ps' to check if containers are running"
echo "   - Use 'docker logs <container>' to view container logs"
echo "   - Use 'nc -zv localhost 5060' to test SIP port"
echo ""
echo "📖 Documentation:"
echo "   - DEPLOY.md - Detailed deployment guide"
echo "   - CHECKLIST.md - Pre/post deployment checklist"
echo "   - QUICKREF.md - Quick reference for common commands"
echo ""
echo "Note: You may need to log out and back in for docker group changes to take effect"
echo ""
