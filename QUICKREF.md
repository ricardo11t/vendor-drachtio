# 🚀 Quick Reference - Comandos Essenciais

## 📍 Localização dos Arquivos

```bash
/opt/drachtio-vendor/vendor-drachtio/
├── docker-compose.prod.yml      # Configuração principal
├── deploy.sh                     # Script de deploy automático
├── rollback.sh                   # Script para rollback
├── monitor.sh                    # Script de monitoramento
├── DEPLOY.md                     # Guia detalhado de deployment
├── CHECKLIST.md                  # Checklist pré-deployment
├── app.js                        # Aplicação main
├── lib/
│   ├── outbound-registration.js  # Registra trunks com Wavoip
│   └── call-session.js           # Lógica de chamadas SIP
└── package.json                  # Dependências
```

## 🎯 Operações Principais

### 1️⃣ Primeira Vez: Deploy Automático

```bash
# Na VPS via SSH
bash /opt/drachtio-vendor/vendor-drachtio/deploy.sh https://seu-backend-url.up.railway.app

# Ou se ainda não tem o repo:
git clone https://github.com/ricardo11t/vendor-backend-nestjs.git /opt/drachtio-vendor
cd /opt/drachtio-vendor/vendor-drachtio
bash deploy.sh https://seu-backend-url.up.railway.app
```

### 2️⃣ Verificar Status

```bash
cd /opt/drachtio-vendor/vendor-drachtio

# Verificar se containers estão rodando
docker-compose -f docker-compose.prod.yml ps

# Esperado:
# NAME                      STATUS
# drachtio-server          Up (healthy)
# drachtio-redis           Up (healthy)
# drachtio-vendor-app      Up (healthy)
```

### 3️⃣ Ver Logs

```bash
cd /opt/drachtio-vendor/vendor-drachtio

# Últimos 20 logs
docker-compose -f docker-compose.prod.yml logs --tail=20 app

# Logs em tempo real
docker-compose -f docker-compose.prod.yml logs -f app

# Só erros
docker-compose -f docker-compose.prod.yml logs app | grep -i error
```

### 4️⃣ Monitore em Tempo Real

```bash
cd /opt/drachtio-vendor/vendor-drachtio

# Monitor com refresh a cada 10 segundos
bash monitor.sh

# Monitor com refresh a cada 5 segundos
bash monitor.sh 5
```

### 5️⃣ Reiniciar Serviços

```bash
cd /opt/drachtio-vendor/vendor-drachtio

# Reiniciar apenas a app (mantém drachtio)
docker-compose -f docker-compose.prod.yml restart app

# Reiniciar tudo
docker-compose -f docker-compose.prod.yml restart

# Parar tudo (graceful)
docker-compose -f docker-compose.prod.yml down

# Parar e remover dados
docker-compose -f docker-compose.prod.yml down -v
```

### 6️⃣ Fazer Rollback

```bash
cd /opt/drachtio-vendor/vendor-drachtio

# Se algo deu errado, voltar para versão anterior
bash rollback.sh

# Selecionar o commit específico ou pressionar Enter para HEAD~1
```

### 7️⃣ Atualizar Código

```bash
cd /opt/drachtio-vendor/vendor-drachtio

# Puxar últimas mudanças
git pull origin main

# Rebuild e restart
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

### 8️⃣ Verificar Conectividade

```bash
cd /opt/drachtio-vendor/vendor-drachtio

# Testar porta SIP (5060)
nc -zv localhost 5060

# Testar Drachtio control port (9022)
nc -zv localhost 9022

# Testar Redis (6379)
nc -zv localhost 6379

# Testar backend API
curl https://seu-backend-url/health
```

## 📊 Informações de Containers

```bash
# Ver recursos usados
docker stats

# Inspecionar container específico
docker inspect drachtio-vendor-app

# Ver variáveis de ambiente
docker inspect drachtio-vendor-app | grep -A 20 '"Env"'

# Ver ports mapeadas
docker port drachtio-server
docker port drachtio-vendor-app
```

## 🔧 Troubleshooting

### ❌ Problema: Port 5060 não responde

```bash
# Verificar se está listening
sudo netstat -tulpn | grep 5060

# Abrir firewall
sudo ufw allow 5060/udp
sudo ufw allow 5060/tcp
sudo ufw enable

# Ou com iptables (alternativa)
sudo iptables -A INPUT -p udp --dport 5060 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 5060 -j ACCEPT
```

### ❌ Problema: Backend não acessível

```bash
# Verificar BACKEND_URL configurada
docker-compose -f docker-compose.prod.yml config | grep BACKEND_URL

# Testar conectividade
curl -v https://seu-backend-url/sip/trunk/outbound

# Ver logs de erro específicos
docker logs drachtio-vendor-app | grep -i "backend\|failed\|error"
```

### ❌ Problema: Containers não iniciam

```bash
# Ver erro completo
docker-compose -f docker-compose.prod.yml logs app

# Tentar start novamente com output
docker-compose -f docker-compose.prod.yml up

# Se container crashed, ver o que aconteceu
docker logs drachtio-vendor-app --tail=50
```

### ❌ Problema: Sem espaço em disco

```bash
# Ver uso de espaço
df -h

# Limpar imagens não usadas
docker image prune -a

# Limpar containers parados
docker container prune

# Limpar volumes não usados
docker volume prune

# Limpeza completa (CUIDADO!)
docker system prune -a
```

## 🚨 Emergência

```bash
# Se tudo quebrou, voltar ao estado anterior:
cd /opt/drachtio-vendor/vendor-drachtio
bash rollback.sh

# Se docker não responde:
sudo systemctl restart docker

# Se nada funciona, start from scratch:
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d --build

# Ver logs completos (salvar para análise):
docker logs drachtio-vendor-app > /tmp/emergency-logs.txt 2>&1
```

## 📋 Verificação Pré-Deployment

```bash
# 1. Clonar repo (se não tiver)
git clone https://github.com/ricardo11t/vendor-backend-nestjs.git /opt/drachtio-vendor

# 2. Navegar para drachtio
cd /opt/drachtio-vendor/vendor-drachtio

# 3. Editar docker-compose.prod.yml com IPs/URLs corretas
nano docker-compose.prod.yml
# Procurar por: BACKEND_URL e PUBLIC_IP

# 4. Verificar conectividade antes de deploy
curl https://seu-backend-url/health

# 5. Deploy
bash deploy.sh https://seu-backend-url.up.railway.app

# 6. Monitorar
bash monitor.sh
```

## 🎯 Fluxo de Teste de Chamada

```bash
# 1. Confirmar que está recebendo (porta aberta)
nc -zv seu-vps-ip 5060

# 2. Ver logs em tempo real
docker-compose -f docker-compose.prod.yml logs -f app

# 3. Fazer uma chamada SIP (via Wavoip ou teste)

# 4. Na outra janela, ver o que foi logado
# Deve aparecer:
#   - INVITE received
#   - DID extracted: <seu-did>
#   - 200 OK sent
#   - Call routed to LiveKit
```

## 📞 Wavoip Integration

```bash
# Verificar se Wavoip consegue registrar
docker logs drachtio-vendor-app | grep -i "register\|trunk"

# Esperado:
# "Successfully registered Wavoip trunk"
# ou para cada trunk configurado

# Se não registrou, verificar:
# 1. Backend URL está correto
# 2. Trunks estão com isActive: true
# 3. Credenciais Wavoip estão corretas
docker logs drachtio-vendor-app | grep -i "failed\|error"
```

## 📈 Performance Monitoring

```bash
# Ver recursos em tempo real
watch docker stats

# Ver histórico de CPU/Memória
docker stats --no-stream

# Ver se há memory leaks
while true; do docker stats --no-stream | grep drachtio-vendor-app; sleep 60; done
```

## 🔐 Segurança

```bash
# Mudar DRACHTIO_SECRET (security)
# Editar docker-compose.prod.yml e mudar: DRACHTIO_SECRET: cymru → seu-secret

# Verificar que secrets não estão no git
git log --name-only | xargs grep -l "DRACHTIO_SECRET\|LIVEKIT_SECRET"

# Limpar secrets do histórico (se committed por acaso)
git filter-branch --tree-filter 'rm -f docker-compose.prod.yml' -- --all
```

---

## 🎓 Documentação Completa

Para informações mais detalhadas, consulte:
- `DEPLOY.md` - Guia completo de deployment
- `CHECKLIST.md` - Checklist pré/pós deployment
- `docker-compose.prod.yml` - Configuração comentada

---

**Última atualização**: 2024
**Versão**: Production Ready v1.0
