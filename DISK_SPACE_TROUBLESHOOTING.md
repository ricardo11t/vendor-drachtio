# 🚨 Troubleshooting: Disk Space Issues no EC2

## Problema: "No space left on device"

Este documento ajuda a resolver problemas de espaço em disco no EC2 durante deploys do Drachtio.

---

## 📊 Sintomas

- Deploy falha com: `error: file write error: No space left on device`
- `git pull` falha ao escrever objetos
- Docker não consegue fazer build
- `df -h` mostra disco acima de 90-100%

---

## 🔍 Diagnóstico

### 1. Verificar uso geral de disco
```bash
df -h
# Ou mais detalhado:
df -h /
```

### 2. Ver o que está usando espaço
```bash
du -sh /* | sort -rh
```

### 3. Verificar uso do Docker
```bash
docker system df
```

### 4. Listar imagens e containers
```bash
docker images -a
docker ps -a
docker volume ls
```

---

## 🧹 Soluções

### Solução Rápida (Executar Script)

O repositório inclui um script de limpeza automático:

```bash
cd ~/vendor-drachtio
chmod +x cleanup-disk.sh
./cleanup-disk.sh
```

Este script faz:
- ✅ Para containers Docker
- ✅ Remove containers parados
- ✅ Remove imagens dangling
- ✅ Remove imagens não utilizadas (>72h)
- ✅ Remove volumes órfãos
- ✅ Limpa build cache
- ✅ Limpa npm cache
- ✅ Remove logs antigos

### Solução Manual Passo a Passo

#### 1. Parar tudo
```bash
cd ~/vendor-drachtio
docker-compose down
```

#### 2. Remover containers parados
```bash
docker container prune -f
```

#### 3. Remover imagens não utilizadas
```bash
# Apenas dangling images
docker image prune -f

# Todas as imagens não utilizadas (cuidado!)
docker image prune -f --all

# Imagens não usadas há mais de 72h
docker image prune -f --all --filter "until=72h"
```

#### 4. Remover volumes órfãos
```bash
docker volume prune -f
```

#### 5. Limpar build cache
```bash
docker builder prune -f --all
```

#### 6. Limpar npm cache
```bash
npm cache clean --force
```

#### 7. Verificar resultado
```bash
df -h /
docker system df
```

---

## 🔄 Deploy Após Limpeza

Após liberar espaço, fazer deploy normalmente:

```bash
cd ~/vendor-drachtio
git pull origin main
docker-compose up -d --build
```

---

## 🛠️ Soluções Permanentes

### 1. Aumentar Volume EBS

Se o problema persiste mesmo após limpeza:

```bash
# Ver tamanho atual
lsblk

# Ver ponto de montagem
df -h /

# Se estiver usando /dev/xvda, aumentar tamanho:
# 1. Parar EC2
# 2. Criar snapshot do volume
# 3. Criar novo volume maior do snapshot
# 4. Anexar à instância
# 5. Expandir partição com: sudo growpart /dev/xvda 1
# 6. Expandir filesystem: sudo resize2fs /dev/xvda1
```

### 2. Configurar Limpeza Automática

Adicionar ao crontab para limpeza diária:

```bash
sudo crontab -e

# Adicionar:
0 2 * * * /home/ubuntu/vendor-drachtio/cleanup-disk.sh > /var/log/drachtio-cleanup.log 2>&1
```

### 3. Monitorar Uso de Disco

Criar alerta se disco > 85%:

```bash
#!/bin/bash
# check-disk.sh
USAGE=$(df / | awk 'NR==2 {print int($5)}')
if [ ${USAGE} -gt 85 ]; then
  echo "ALERTA: Disco em ${USAGE}%"
  /path/to/cleanup-disk.sh
fi
```

### 4. Otimizar Docker

Editar `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "storage-opts": [
    "overlay2.override_kernel_check=true"
  ]
}
```

Depois reiniciar:
```bash
sudo systemctl restart docker
```

---

## 📋 Checklist de Manutenção

- [ ] Executar `cleanup-disk.sh` semanalmente
- [ ] Monitorar `df -h /` regularmente
- [ ] Revisar tamanho do volume a cada mês
- [ ] Manter logs com max-size de 10MB
- [ ] Arquivar logs antigos mensalmente
- [ ] Documentar aumento de volume

---

## 🔗 Referências

- [Docker System Prune](https://docs.docker.com/config/pruning/)
- [AWS EBS Volume Resize](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-modify-volume.html)
- [Docker Logging Driver](https://docs.docker.com/config/containers/logging/configure/)

---

## 💡 Dicas

1. **Rodar limpeza antes de critical deploys**
   ```bash
   ./cleanup-disk.sh && git pull && docker-compose up -d --build
   ```

2. **Monitorar em tempo real**
   ```bash
   watch -n 5 'df -h / && echo "---" && docker system df'
   ```

3. **Saiba onde está o espaço**
   ```bash
   docker images --no-trunc
   du -sh /var/lib/docker/*
   ```

---

**Última atualização**: Dezembro 1, 2025
