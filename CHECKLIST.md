# 📋 Pre-Deployment Checklist

Use esta checklist para garantir que tudo está configurado corretamente antes de fazer deploy na nova VPS.

## 🎯 Fase 1: Preparação Local

- [ ] Clone do repositório atualizado
- [ ] `docker-compose.prod.yml` revisado e comentado
- [ ] `deploy.sh` script criado
- [ ] `monitor.sh` script criado
- [ ] `rollback.sh` script criado
- [ ] `DEPLOY.md` documentation criada
- [ ] Todos os scripts têm permissão de execução

**Comando para dar permissão:**
```bash
chmod +x deploy.sh monitor.sh rollback.sh
```

---

## 🔧 Fase 2: Configuração da Nova VPS

### VPS Requirements
- [ ] Sistema operacional: Ubuntu 22.04 LTS
- [ ] Mínimo: 2GB RAM, 2 CPU, 20GB SSD
- [ ] Endereço IP público atribuído
- [ ] SSH access configurado
- [ ] Security group/firewall permite:
  - [ ] Port 5060 UDP (SIP)
  - [ ] Port 5060 TCP (SIP)
  - [ ] Port 22 TCP (SSH)

### IP Address Information
- [ ] **New VPS Public IP**: _________________________ 
- [ ] **Old VPS IP (for migration)**: 100.25.218.14
- [ ] Verificar que novo IP é diferente do anterior

---

## 🌐 Fase 3: Backend Configuration

- [ ] **Railway Backend URL**: _________________________
  - [ ] Formato correto: `https://seu-backend-on-railway.up.railway.app`
  - [ ] Testado localmente: `curl <BACKEND_URL>/health` retorna 200
  - [ ] API `/sip/trunk/outbound` é acessível

- [ ] **Backend Endpoints Verificados**:
  - [ ] `GET /sip/trunk/outbound` retorna lista de trunks
  - [ ] Pelo menos 1 OutboundTrunk está configurado
  - [ ] Trunk tem `isActive: true`

**Verificação:**
```bash
curl https://seu-backend-on-railway.up.railway.app/sip/trunk/outbound
```

Resposta esperada:
```json
[
  {
    "id": "uuid",
    "name": "Wavoip",
    "isActive": true,
    "authUsername": "seu_usuario",
    "authPassword": "sua_senha",
    "sipHost": "sipv2.wavoip.com",
    ...
  }
]
```

---

## 🔐 Fase 4: Secrets & Credentials

- [ ] **BACKEND_URL**: _________________________
- [ ] **PUBLIC_IP (novo VPS)**: _________________________
- [ ] **PUBLIC_SIP_PORT**: 5060 ✓
- [ ] **LIVEKIT_URL**: _________________________
- [ ] **LIVEKIT_KEY**: _________________________
- [ ] **LIVEKIT_SECRET**: _________________________

**Guardar em local seguro (ex: 1Password, AWS Secrets Manager)**

⚠️ **NÃO colocar secrets em git!** Usar variáveis de ambiente na VPS.

---

## 📦 Fase 5: Wavoip Configuration

### Tronco SIP Atual (que precisa ser atualizado)

- [ ] **Nome do Tronco**: _________________________
- [ ] **IP Atual**: 100.25.218.14:5060
- [ ] **Authuser**: _________________________
- [ ] **Authpassword**: _________________________

### Tronco SIP Novo

- [ ] **Nome do Tronco**: (mesmo nome)
- [ ] **IP Novo**: <NEW_VPS_IP>:5060  ← Copiar do novo VPS
- [ ] **Authuser**: (manter igual)
- [ ] **Authpassword**: (manter igual)

**Checklist de Teste Wavoip:**
- [ ] Tronco foi atualizado no painel Wavoip
- [ ] Status de registro foi resetado (aguardar reconexão)
- [ ] DIDs associados estão configurados
- [ ] Routing rules apontam para o servidor correto

---

## 🚀 Fase 6: Deploy

### Opção A: Usar script de deploy (RECOMENDADO)

```bash
# Na nova VPS:
bash deploy.sh https://seu-backend-on-railway.up.railway.app
```

Checklist:
- [ ] Script executou sem erros
- [ ] Containers foram criados
- [ ] Services estão healthy (docker ps)
- [ ] Logs não mostram erros críticos

### Opção B: Deploy manual

```bash
cd /opt/drachtio-vendor/vendor-drachtio

# Editar docker-compose.prod.yml com valores corretos
nano docker-compose.prod.yml

# Iniciar serviços
docker-compose -f docker-compose.prod.yml up -d

# Verificar status
docker-compose -f docker-compose.prod.yml ps
```

---

## ✅ Fase 7: Pós-Deploy Verification

### Containers Health
```bash
cd /opt/drachtio-vendor/vendor-drachtio

# Verificar todos os containers
docker-compose -f docker-compose.prod.yml ps
```

- [ ] drachtio-server: `Up (healthy)`
- [ ] drachtio-redis: `Up (healthy)`
- [ ] drachtio-vendor-app: `Up (healthy)`

### Port Binding
```bash
# De fora da VPS:
nc -zv <NEW_VPS_IP> 5060
```

- [ ] Port 5060 responde (connection successful)
- [ ] Firewall permite tráfego SIP

### Backend Connectivity
```bash
docker logs drachtio-vendor-app --tail=30 | grep -i backend
```

Expected log:
```
Fetching outbound trunks from backend
Successfully registered <N> trunks
```

- [ ] App consegue acessar backend API
- [ ] Trunks foram registrados

### Test Call
1. [ ] Discar seu DID Wavoip
2. [ ] Monitorar logs: `docker logs drachtio-vendor-app -f`
3. [ ] Verificar logs para:
   ```
   INVITE received
   DID extracted
   200 OK sent
   Call routed to LiveKit
   ```

---

## 📊 Fase 8: Monitoring & Maintenance

### Monitoring Script
```bash
bash /opt/drachtio-vendor/vendor-drachtio/monitor.sh
# ou com intervalo customizado:
bash /opt/drachtio-vendor/vendor-drachtio/monitor.sh 5
```

- [ ] Script mostra status dos containers
- [ ] Mostra uso de recursos
- [ ] Mostra logs recentes
- [ ] Detecta erros automáticamente

### Logging Setup (opcional)
```bash
# Ver logs contínuos
docker-compose -f docker-compose.prod.yml logs -f app

# Ver logs de erro
docker-compose -f docker-compose.prod.yml logs app | grep -i error

# Guardar logs para análise
docker-compose -f docker-compose.prod.yml logs app > logs-backup.txt
```

- [ ] Leitura dos logs para debug funcionando
- [ ] Backup de logs configurado (opcional)

---

## 🆘 Troubleshooting Quick Ref

| Problema | Solução Rápida |
|----------|---|
| "Connection refused on port 5060" | `sudo ufw allow 5060/udp; sudo ufw allow 5060/tcp` |
| "Cannot connect to backend" | Verificar `BACKEND_URL` em `docker-compose.prod.yml` |
| "Docker not found" | `curl -fsSL https://get.docker.com \| sh` |
| "Containers not starting" | `docker-compose logs app` para ver erro |
| "Port already in use" | `sudo lsof -i :5060` e kill processo |

---

## 📝 Fase 9: Documentação & Handoff

- [ ] Documentação atualizada com novo IP
- [ ] Credenciais guardadas em local seguro
- [ ] Runbooks criados para operações comuns:
  - [ ] Como ver logs
  - [ ] Como reiniciar serviço
  - [ ] Como fazer rollback
  - [ ] Como atualizar código

---

## 🎯 Final Validation

- [ ] TODAS as seções acima completadas
- [ ] Ao menos 1 test call realizado com sucesso
- [ ] Logs monitorados por 5+ minutos sem erros
- [ ] VM antiga pode ser desligada com segurança

---

## 📅 Deployment Record

**Data**: _________________________

**Operador**: _________________________

**Novo IP**: _________________________

**Backend URL**: _________________________

**Notas**: _________________________

_________________________

_________________________

---

## Emergency Contacts

Se algo der errado durante deployment:

- [ ] Documentação: `/opt/drachtio-vendor/vendor-drachtio/DEPLOY.md`
- [ ] Scripts: `deploy.sh`, `rollback.sh`, `monitor.sh`
- [ ] Rollback: `bash rollback.sh`
- [ ] Support: Verificar logs com `docker logs drachtio-vendor-app`
