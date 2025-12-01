#!/bin/bash

# ============================================================================
# Disk Cleanup Script for Drachtio EC2 Instance
# Executa limpeza agressiva de Docker e sistema para liberar espaço
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}===================================================${NC}"
echo -e "${YELLOW}   Vendor Drachtio - Disk Cleanup Script${NC}"
echo -e "${YELLOW}===================================================${NC}"
echo ""

# ============================================================================
# 1. VERIFICAR ESPAÇO ATUAL
# ============================================================================
echo -e "${YELLOW}📊 Verificando espaço em disco...${NC}"
echo ""

df -h | grep -E "^/dev/|Mounted"
echo ""

DISK_USAGE=$(df / | awk 'NR==2 {print int($5)}')
echo -e "Uso de disco: ${DISK_USAGE}%"
echo ""

if [ ${DISK_USAGE} -lt 80 ]; then
  echo -e "${GREEN}✅ Disco em bom estado (< 80%). Limpeza não urgente.${NC}"
  exit 0
fi

# ============================================================================
# 2. LIMPEZA DOCKER
# ============================================================================
echo -e "${YELLOW}🧹 Iniciando limpeza Docker...${NC}"
echo ""

# Parar containers se necessário
echo -e "Parando containers..."
docker-compose down 2>/dev/null || docker stop $(docker ps -q) 2>/dev/null || echo "Nenhum container em execução"
sleep 2
echo ""

# Remover containers parados
echo -e "Removendo ${RED}containers parados${NC}..."
CONTAINERS=$(docker container ls -aq)
if [ -n "$CONTAINERS" ]; then
  docker container rm $(docker container ls -aq) 2>/dev/null || echo "Nenhum container para remover"
else
  echo "Nenhum container parado"
fi
echo ""

# Remover imagens dangling
echo -e "Removendo ${RED}imagens dangling${NC}..."
DANGLING=$(docker images -q --filter "dangling=true")
if [ -n "$DANGLING" ]; then
  docker image rm $(docker images -q --filter "dangling=true") 2>/dev/null || echo "Falha ao remover algumas imagens"
else
  echo "Nenhuma imagem dangling encontrada"
fi
echo ""

# Remover imagens antigas não utilizadas
echo -e "Removendo ${RED}imagens não utilizadas (>72h)${NC}..."
docker image prune -f --all --filter "until=72h" 2>/dev/null || echo "Nenhuma imagem para remover"
echo ""

# Remover volumes órfãos
echo -e "Removendo ${RED}volumes órfãos${NC}..."
docker volume prune -f 2>/dev/null || echo "Nenhum volume para remover"
echo ""

# Limpar build cache
echo -e "Limpando ${RED}build cache${NC}..."
docker builder prune -f --all 2>/dev/null || echo "Falha ao limpar cache"
echo ""

# ============================================================================
# 3. LIMPEZA DO SISTEMA
# ============================================================================
echo -e "${YELLOW}🧹 Limpando arquivos temporários do sistema...${NC}"
echo ""

# Limpar npm cache globalmente
if command -v npm &> /dev/null; then
  echo -e "Limpando ${RED}npm cache${NC}..."
  npm cache clean --force 2>/dev/null || echo "Falha ao limpar npm cache"
fi
echo ""

# Limpar apt cache (se em Ubuntu/Debian)
if command -v apt-get &> /dev/null; then
  echo -e "Limpando ${RED}apt cache${NC}..."
  sudo apt-get clean 2>/dev/null || echo "Falha ao limpar apt (requer sudo)"
  sudo apt-get autoclean 2>/dev/null || echo "Falha ao limpar apt"
fi
echo ""

# Limpar logs antigos
echo -e "Limpando ${RED}logs antigos${NC}..."
find /var/log -type f -name "*.log" -mtime +30 -delete 2>/dev/null || echo "Falha ao remover alguns logs"
echo ""

# Limpar /tmp
echo -e "Limpando ${RED}arquivos temporários${NC}..."
rm -rf /tmp/* 2>/dev/null || echo "Falha ao limpar /tmp"
echo ""

# ============================================================================
# 4. RESULTADO FINAL
# ============================================================================
echo -e "${YELLOW}📊 Verificando espaço após limpeza...${NC}"
echo ""

df -h | grep -E "^/dev/|Mounted"
echo ""

DISK_USAGE_AFTER=$(df / | awk 'NR==2 {print int($5)}')
echo -e "Uso de disco: ${DISK_USAGE_AFTER}%"
FREED=$((DISK_USAGE - DISK_USAGE_AFTER))

echo ""
if [ ${DISK_USAGE_AFTER} -lt 80 ]; then
  echo -e "${GREEN}✅ Limpeza bem-sucedida!${NC}"
  echo -e "Espaço liberado: ${FREED}%"
else
  echo -e "${RED}❌ Disco ainda acima de 80%${NC}"
  echo -e "Possíveis soluções:"
  echo -e "  1. Aumentar tamanho do volume EBS"
  echo -e "  2. Remover arquivos grandes com: ${YELLOW}du -sh /* | sort -rh${NC}"
  echo -e "  3. Verificar usar: ${YELLOW}docker system df${NC}"
fi

echo ""
echo -e "${YELLOW}===================================================${NC}"
echo -e "${YELLOW}   Limpeza concluída${NC}"
echo -e "${YELLOW}===================================================${NC}"
