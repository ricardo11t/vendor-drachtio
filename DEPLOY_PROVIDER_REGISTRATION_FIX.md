# 🚀 Deploy da Correção - Provider Registration Status

## Problema Identificado
O Drachtio estava registrando com sucesso com provedores SIP, mas o status no banco de dados permanecia como "Pendente" porque:

1. ❌ A função `updateProviderRegistrationStatus()` não estava incluindo autenticação (API Key)
2. ❌ A função não estava sendo chamada após o sucesso inicial da registração
3. ❌ O timestamp estava sendo enviado como objeto Date em vez de string ISO

## Solução Implementada

### Arquivo: `lib/provider-registration.js`

#### Mudança 1: Adicionar autenticação e melhorar request
```javascript
// ANTES
await axios.patch(endpoint, {
  registerStatus: status,
  registerError: error,
  lastRegisterAt: new Date(),
});

// DEPOIS
const response = await axios.patch(
  endpoint,
  {
    registerStatus: status,
    registerError: error,
    lastRegisterAt: new Date().toISOString(),  // ← ISO string
  },
  {
    headers: {
      'x-api-key': apiKey,                     // ← API Key adicionada
      'Content-Type': 'application/json',
    },
    timeout: 5000,
  },
);
```

#### Mudança 2: Chamar updateProviderRegistrationStatus() após sucesso
```javascript
// Na função initializeProviderRegistrations()
try {
  const handle = await registerWithProvider(srf, provider, logger);
  activeRegistrations[provider.id] = { ... };
  
  // ← NOVO: Atualizar backend com sucesso
  await updateProviderRegistrationStatus(
    provider.id,
    'registered',
    null,
    logger,
  );
  
  scheduleProviderRefresh(srf, provider, activeRegistrations, logger);
} catch (err) {
  logger.error({ error: err.message, providerName: provider.name }, '❌ Failed...');
  
  // ← NOVO: Atualizar backend com erro
  await updateProviderRegistrationStatus(
    provider.id,
    'failed',
    err.message,
    logger,
  );
}
```

## 📋 Instruções de Deploy

### Opção 1: Deploy via GitHub Actions (Automático)
O próximo push para `main` da branch `vendor-drachtio` acionará deploy automático.

**Já foi feito**:
```bash
git push origin main  # ✅ Enviado
```

O GitHub Actions vai:
1. Fazer limpeza de disco se necessário
2. Fazer build e deploy da nova versão
3. Reiniciar container Drachtio

**ETA**: ~2-5 minutos

### Opção 2: Deploy Manual no EC2

```bash
# SSH no EC2
ssh -i your-key.pem ubuntu@your-ec2-ip

# Navegar ao diretório
cd ~/vendor-drachtio

# Fazer pull da versão nova
git pull origin main

# Limpar disco se necessário
./cleanup-disk.sh

# Rebuild e restart
docker-compose down
docker-compose up -d --build

# Verificar logs
docker-compose logs -f drachtio-controller
```

## ✅ Verificação Pós-Deploy

### 1. Verificar se Drachtio iniciou corretamente
```bash
docker-compose logs drachtio-controller | tail -20
```

Procure por:
```
✅ Provider registration successful
✅ Provider registration initialization completed
⏱️  Provider registration refresh scheduled
```

### 2. Verificar status no banco de dados
```bash
# No seu banco de dados PostgreSQL
SELECT 
  id,
  name,
  host,
  registerStatus,
  registerError,
  lastRegisterAt,
  nextRefreshAt
FROM "ProviderRegistration"
WHERE name = 'wavoip'
ORDER BY "updatedAt" DESC
LIMIT 5;
```

Status esperado:
- ✅ registerStatus: `registered` (era `pending`)
- ✅ lastRegisterAt: timestamp recent
- ✅ registerError: `null`

### 3. Verificar no Frontend
- Navegar para: `/configuracoes/sip`
- Clicar na aba: `Provedores SIP`
- Status do wavoip deve estar: **Registrado** (verde)

### 4. Testar chamada inbound
Se tudo estiver correto:
1. Fazer chamada SIP do WaVoIP para o Drachtio
2. Drachtio deve receber como INVITE
3. Rotear para LiveKit conforme dispatch rules

## 🔍 Troubleshooting

### Se status ainda estiver "Pendente" após deploy:

#### 1. Verificar logs do Drachtio
```bash
docker-compose logs drachtio-controller | grep -E "registration|status|updated"
```

Procure por:
- `✅ Provider registration successful` - registração OK
- `✅ Provider registration status updated in backend` - status atualizado
- `⚠️  Failed to update provider registration status` - falha na atualização

#### 2. Verificar conectividade Backend
```bash
docker-compose exec drachtio-controller curl -i \
  -X PATCH https://vendor-api.up.railway.app/api/sip/provider-registration/ID \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"registerStatus":"registered","lastRegisterAt":"2025-12-01T03:50:09Z"}'
```

#### 3. Verificar API Key
```bash
# No docker-compose.yml ou .env, verificar:
API_KEY=... # Deve estar configurado
BACKEND_URL=https://vendor-api.up.railway.app
```

#### 4. Verificar permissões de UPDATE no endpoint
Backend deve ter endpoint:
```
PATCH /api/sip/provider-registration/:id
```

Que aceita:
```json
{
  "registerStatus": "registered|pending|failed",
  "registerError": "error message or null",
  "lastRegisterAt": "2025-12-01T03:50:09Z"
}
```

## 📊 Timeline Esperado

### Imediatamente após restart
```
1. Drachtio inicia
2. Fetch provider registrations da API
3. Para cada provider:
   - Enviar REGISTER SIP
   - Receber 200 OK (sucesso) ou erro
   - NOVO: Atualizar banco de dados com status
4. Agendar refresh automático (5 minutos)
```

### A cada 5 minutos
```
1. Fetch lista de providers novamente
2. Para qualquer novo: registrar
3. Verificar próximo refresh de cada um
```

### 60 segundos antes de expirar
```
1. Re-registrar com provider
2. Receber novo expires
3. Agendar próximo refresh
```

## 🎯 Success Criteria

- [ ] Status no banco mudou de "Pendente" → "Registrado" ✅
- [ ] Frontend mostra status em VERDE ✅
- [ ] `lastRegisterAt` tem timestamp recente ✅
- [ ] `registerError` é null ✅
- [ ] Logs do Drachtio mostram sucesso ✅
- [ ] Chamada inbound do WaVoIP chega ao Drachtio ✅

## 📝 Commits Feitos

```
vendor-drachtio/main:
└─ c946a1d fix: add API key auth and update registration status after successful REGISTER
```

## 🔗 Referências

- [Provider Registration Script](./lib/provider-registration.js)
- [Implementation Summary](../PROVIDER_REGISTRATION_SUMMARY.md)
- [Disk Space Troubleshooting](./DISK_SPACE_TROUBLESHOOTING.md)

---

**Status**: Pronto para deploy ✅
**Data**: Dezembro 1, 2025, 00:53 UTC
