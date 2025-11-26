# Drachtio SIP Server - Arquitetura Dinâmica

## 📋 Visão Geral

O Drachtio agora funciona **100% dinamicamente**, puxando todas as configurações do Backend via API, em vez de usar hardcoded environment variables.

### ❌ Antes (Problema)

```dockerfile
# Dockerfile tinha 10+ environment variables mockados
ENV LIVEKIT_URL=wss://...
ENV LIVEKIT_KEY=API...
ENV LIVEKIT_SECRET=...
ENV PUBLIC_IP=...
ENV PUBLIC_SIP_PORT=...
# ... E MAIS MUITOS!
```

Problema: Qualquer mudança exigia rebuild da imagem Docker 😞

### ✅ Agora (Solução)

```dockerfile
# Dockerfile minimalista
ENV NODE_ENV=production
ENV DRACHTIO_HOST=drachtio
ENV DRACHTIO_PORT=9022
ENV DRACHTIO_SECRET=cymru
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379
ENV LOGLEVEL=info
```

```yaml
# docker-compose.yml apenas 2 variáveis essenciais
BACKEND_URL: https://seu-backend.com/api
API_KEY_SIP: sua-chave-super-secreta-aqui
```

**TODO O RESTO VEM DA API!** 🚀

---

## 🔄 Fluxo de Startup

```
1. Docker container inicia
   ↓
2. app-dynamic.js carrega
   ↓
3. Conecta ao Drachtio Server (porta 9022)
   ↓
4. Conecta ao Redis
   ↓
5. Chama getSipConfig() 
   ↓
6. Requisita GET /api/sip/config (com header x-api-key)
   ↓
7. Backend valida API Key
   ↓
8. Backend retorna configurações:
   - livekitSipDomain
   - livekitApiKey
   - livekitApiSecret
   - livekitUrl
   - publicIp
   - publicSipPort
   - sipTransport
   - livekitInboundTrunkId
   - rtpEngineHost
   - rtpEnginePort
   ↓
9. Drachtio cacheia por 5 minutos
   ↓
10. Ready para rotear chamadas!
```

---

## 🚀 Como Usar

### 1. Clonar o Repositório

```bash
cd vendor-backend-nestjs/vendor-drachtio
```

### 2. Copiar .env.example

```bash
cp .env.example .env
```

### 3. Editar .env com suas configurações

```env
# Backend
BACKEND_URL=https://seu-backend.com/api
API_KEY_SIP=sua-chave-super-secreta-aqui

# LiveKit (OPCIONAL - se quiser testar localmente)
# Senão, tudo vem da API
LIVEKIT_URL=wss://seu-livekit.cloud
LIVEKIT_KEY=API...
LIVEKIT_SECRET=...
```

### 4. Iniciar com Docker

```bash
docker-compose up -d
```

### 5. Verificar Logs

```bash
docker logs -f drachtio-controller
```

Você verá:

```
✅ SIP config fetched from backend and cached
Ready to receive SIP calls - routing to LiveKit
```

---

## 📊 Cache Strategy

O Drachtio mantém cache da config por **5 minutos**:

```javascript
const CONFIG_TTL = 5 * 60 * 1000; // 5 minutes

// Cada requisição SIP:
1. Verifica se cache ainda é válido
2. Se sim: usa cache (muito rápido)
3. Se não: busca nova do Backend

// Benefício: Reduz requisições à API
```

### E se o Backend cair?

```javascript
// Se API estiver down mas já carregou config antes:
if (sipConfigCache) {
  return sipConfigCache; // Usa cache antigo
}

// Se NUNCA carregou config:
throw Error('Failed to load SIP config')
```

Ou seja: **Modo fallback automático** ✅

---

## 🔐 Segurança

### API Key Protection

Toda requisição para `/api/sip/config` exige header:

```bash
curl -H "x-api-key: sua-chave-secreta" \
  https://seu-backend.com/api/sip/config
```

O Drachtio envia automaticamente:

```javascript
// lib/sip-config.js
const apiKey = process.env.API_KEY_SIP || 'default-api-key';
const response = await axios.get(`${backendUrl}/sip/config`, {
  headers: {
    'x-api-key': apiKey
  }
});
```

### Boas Práticas

- ✅ Use API Key **diferente** para cada ambiente (dev, prod)
- ✅ Configure via variável de ambiente (nunca hardcode)
- ✅ Use HTTPS em produção
- ✅ Rotacione a chave periodicamente

---

## 📁 Arquivos Alterados

| Arquivo | Mudança |
|---------|---------|
| `Dockerfile` | Removidos 10+ ENV mockados |
| `docker-compose.yml` | Apenas 2 variáveis essenciais |
| `app-dynamic.js` | Remove fallback para ENV vars |
| `lib/sip-config.js` | Adiciona header x-api-key |
| `.env.example` | Novo arquivo de configuração |

---

## 🧪 Teste a Configuração

### 1. Verificar se Backend está respondendo

```bash
curl -H "x-api-key: sua-chave" \
  https://seu-backend.com/api/sip/config
```

Resposta esperada:

```json
{
  "livekitSipDomain": "sip.livekit.cloud",
  "livekitApiKey": "...",
  "publicIp": "56.125.223.86",
  ...
}
```

### 2. Verificar logs do Drachtio

```bash
docker logs drachtio-controller | grep "SIP config"
```

Output esperado:

```
✅ SIP config fetched from backend and cached
```

### 3. Testar uma chamada SIP

Quando chegar uma chamada:

1. Drachtio chama `/api/sip/destination/{did}` para saber pra onde rotear
2. Backend retorna destino SIP
3. Drachtio roteia para LiveKit

---

## 🆘 Troubleshooting

### "Failed to fetch SIP config from backend"

**Causa:** Backend URL ou API Key incorreta

**Solução:**
```bash
# Teste manualmente
curl -H "x-api-key: sua-chave" https://seu-backend.com/api/sip/config

# Se falhar, verifique:
echo $BACKEND_URL
echo $API_KEY_SIP

# Se ainda falhar, check Backend logs
docker logs backend-container
```

### "API Key inválida"

**Causa:** A chave do Drachtio não bate com a do Backend

**Solução:**
```bash
# No Drachtio
cat .env | grep API_KEY_SIP

# No Backend
cat .env | grep API_KEY_SIP

# Devem ser iguais!
```

### Drachtio não carrega config no startup

**Causa:** Backend não está pronto

**Solução:**
```bash
# O Drachtio tenta carregar em startup
# Se falhar, tenta novamente a cada requisição SIP
# Aguarde o Backend ficar online

docker logs drachtio-controller | grep -E "(SIP config|Error)"
```

---

## 📈 Próximos Passos

### Adicionar mais endpoints dinâmicos

Se quiser que o Drachtio puxe mais coisas da API:

```javascript
// lib/sip-config.js
async function getOutboundTrunks(backendUrl) {
  const apiKey = process.env.API_KEY_SIP;
  const response = await axios.get(`${backendUrl}/sip/trunk/outbound`, {
    headers: { 'x-api-key': apiKey }
  });
  return response.data;
}
```

### Adicionar webhook para reload de config

```bash
# Endpoint para forçar reload da config
POST /api/sip/reload-config

# Drachtio detecta mudança e limpa cache
```

---

## 📚 Documentação

- [DRACHTIO_BACKEND_INTEGRATION.md](../../docs/DRACHTIO_BACKEND_INTEGRATION.md)
- [API_KEY_SECURITY.md](../../docs/API_KEY_SECURITY.md)

---

## 🎯 Objetivo Alcançado ✅

```
❌ Antes:  Environment variables mockados em Dockerfile/docker-compose
✅ Agora:  Tudo puxado dinamicamente da API, protegido por API Key

Resultado:
- Sem rebuild de imagem para mudanças de config
- Única fonte de verdade: Backend API
- Segurança via API Key
- Cache automático
- Fallback para cache se Backend cair
```

---

**Última atualização:** Novembro 2025
