# Drachtio Development Guide - vendor-drachtio

## 🎯 Current Project Status

### Active Feature: SIP Provider Registration
Drachtio acts as the SIP controller that makes REGISTER requests to external SIP providers (WaVoIP, Twilio, etc.) and reports back to the backend API on registration status.

**Status**: 95% Complete - Endpoint path and error logging fixes deployed (Dec 1, 2025)

---

## 📋 Architecture Overview

### Tech Stack
- **Runtime**: Node.js v22.21.1
- **SIP Controller**: Drachtio SRF (Session Resource Framework)
- **Media**: RtpEngine for media handling
- **RPC Layer**: drachtio-srf npm package
- **Deployment**: Docker container on EC2
- **Port**: 5060 (SIP) + 5061 (drachtio protocol)

### Directory Structure
```
vendor-drachtio/
├── lib/
│   ├── app-dynamic.js                    # Main app, initializes everything
│   ├── provider-registration.js          # Provider registration logic ⭐
│   ├── call-session-dynamic.js           # Inbound call handling
│   ├── sip-config.js                     # SIP configuration management
│   └── (other call handling modules)
├── test/
│   └── (test files)
├── package.json
├── docker-compose.yml
├── docker-compose.prod.yml
└── Dockerfile
```

---

## 🔌 Provider Registration System

### Location & Size
- **File**: `lib/provider-registration.js` (395+ lines)
- **Imported in**: `app-dynamic.js` (main entry point)

### Key Functions

#### 1. initializeProviderRegistrations(srf, logger)
**Purpose**: Fetch all active provider registrations from backend and register with them

**Location**: Lines 10-70

**Flow**:
```
1. Fetch all provider registrations from backend API
2. For each provider:
   a. Call registerWithProvider() to make SIP REGISTER
   b. Store registration handle in activeRegistrations
   c. Update backend with status (registered/failed)
   d. Schedule refresh before expiration
3. Schedule periodic refresh every 5 minutes
```

**Code Snippet**:
```javascript
async function initializeProviderRegistrations(srf, logger) {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://backend:3000';
    const endpoint = `${backendUrl}/api/sip/provider-registration`;
    
    const response = await axios.get(endpoint, {
      headers: { 'x-api-key': apiKey },
      timeout: 5000,
    });
    
    const providers = response.data;
    
    for (const provider of providers) {
      // Register with provider
      const handle = await registerWithProvider(srf, provider, logger);
      
      // Store handle
      activeRegistrations[provider.id] = {
        name: provider.name,
        host: provider.host,
        handle,
        nextRefreshAt: new Date(provider.nextRefreshAt),
      };
      
      // Update backend - CRITICAL: This tells backend about successful registration
      await updateProviderRegistrationStatus(
        provider.id,
        'registered',
        null,
        logger
      );
    }
    
    logger.info({ count: providers.length }, '✅ Provider registration initialization completed');
    
    // Schedule periodic refresh
    startProviderRegistrationRefresh(srf, logger);
  } catch (err) {
    logger.error({ error: err.message }, '❌ Failed to initialize provider registrations');
  }
}
```

**Environment Variables Needed**:
- `BACKEND_URL`: Backend API endpoint (default: http://backend:3000)
- `API_KEY`: API key for backend authentication

#### 2. registerWithProvider(srf, provider, logger)
**Purpose**: Make actual SIP REGISTER request to external provider

**Location**: Lines 77-170

**Key Parameters**:
```javascript
{
  id: "cmimlnwfz0006pd01vy4npun2",
  host: "sipv2.wavoip.com",
  username: "W81b8ea99dd62",
  password: "encrypted-password",
  transport: "SIP_TRANSPORT_UDP",
  port: 5060
}
```

**SIP REGISTER Construction**:
```javascript
const req = srf.createUAC({
  method: 'REGISTER',
  uri: `sip:${provider.host}:${provider.port}`,
  headers: {
    'From': `<sip:${provider.username}@${provider.host}>`,
    'To': `<sip:${provider.username}@${provider.host}>`,
    'Contact': `<sip:${provider.username}@${myPublicIp}:5060;transport=${transport}>`,
    'Expires': '3600',  // 1 hour
    'Authorization': basicAuthHeader(provider.username, provider.password)
  }
});
```

**Response Handling**:
```javascript
req.on('response', (res, ack) => {
  if (res.status === 200) {
    // Extract expiration time from Expires header
    const expires = parseInt(res.get('Expires')) || 3600;
    
    logger.info(
      { providerName: provider.name, expires },
      '✅ Provider registration successful (expires in ${expires}s)'
    );
    
    // Return handle for storing
    return handle;
  } else if (res.status === 401) {
    // Authentication failed
    throw new Error(`Authentication failed: ${res.status}`);
  } else {
    // Other failure
    throw new Error(`Registration failed: ${res.status}`);
  }
});
```

**Success Indicators**:
- SIP Response: 200 OK
- Expires header present (typical: 3600 seconds)
- Log message: "✅ Provider registration successful"

#### 3. updateProviderRegistrationStatus(providerId, status, error, logger)
**Purpose**: Report registration status back to backend API (CRITICAL FOR STATUS PERSISTENCE)

**Location**: Lines 293-370

**Endpoint Called**: 
```
PATCH https://vendor-api.up.railway.app/api/sip/provider-registration/{id}
```

**Request Body**:
```json
{
  "registerStatus": "registered|pending|failed",
  "registerError": null,
  "lastRegisterAt": "2025-12-01T04:03:18.612Z"
}
```

**Headers**:
```javascript
{
  'x-api-key': apiKey,          // Required for backend auth
  'Content-Type': 'application/json'
}
```

**Complete Function**:
```javascript
async function updateProviderRegistrationStatus(
  providerId,
  status,
  error,
  logger,
) {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://backend:3000';
    const apiKey = process.env.API_KEY || 'default-api-key';
    const endpoint = `${backendUrl}/api/sip/provider-registration/${providerId}`;

    const response = await axios.patch(
      endpoint,
      {
        registerStatus: status,
        registerError: error,
        lastRegisterAt: new Date().toISOString(),
      },
      {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      },
    );

    // Log response for debugging
    logger.info(
      { 
        providerId, 
        status, 
        endpoint, 
        responseStatus: response.status,
        responseData: response.data 
      },
      '✅ Provider registration status updated in backend',
    );
    
    return response.data;
  } catch (err) {
    logger.error(
      { 
        error: err.message, 
        providerId, 
        status, 
        statusCode: err.response?.status,
        responseData: err.response?.data 
      },
      '⚠️  Failed to update provider registration status in backend',
    );
    // Non-fatal - registration worked, just status update failed
    // Will be corrected on next 5-minute refresh
  }
}
```

**CRITICAL**: This function is called:
1. After successful SIP REGISTER response (200 OK)
2. On failure to report error status
3. During periodic 5-minute refresh

#### 4. scheduleProviderRefresh(srf, provider, activeRegistrations, logger)
**Purpose**: Schedule automatic re-registration before expiration

**Location**: Lines 273-290

**Logic**:
- Registration expires in 3600 seconds (typically)
- Schedule refresh at 80% of expiration time (2880 seconds = 48 minutes)
- This ensures registration stays active before expiry
- On next refresh, updates backend with new `lastRegisterAt`

**Code**:
```javascript
function scheduleProviderRefresh(srf, provider, activeRegistrations, logger) {
  const nextRefreshAt = new Date(
    Date.now() + provider.expiresIn * 0.8 * 1000
  );
  
  setTimeout(async () => {
    const handle = await registerWithProvider(srf, provider, logger);
    activeRegistrations[provider.id].handle = handle;
    activeRegistrations[provider.id].nextRefreshAt = nextRefreshAt;
    
    // Update backend with new lastRegisterAt
    await updateProviderRegistrationStatus(
      provider.id,
      'registered',
      null,
      logger
    );
  }, nextRefreshAt.getTime() - Date.now());
}
```

#### 5. startProviderRegistrationRefresh(srf, logger)
**Purpose**: Periodic refresh of all providers every 5 minutes

**Location**: Lines 372-395

**Logic**:
```javascript
function startProviderRegistrationRefresh(srf, logger) {
  setInterval(async () => {
    logger.info('📡 Initializing Provider Registrations');
    await initializeProviderRegistrations(srf, logger);
  }, 5 * 60 * 1000); // Every 5 minutes
}
```

**Why 5 minutes?**:
- Catch any registrations that failed
- Re-sync with backend in case of missed updates
- Report fresh `lastRegisterAt` timestamp
- Handle cases where provider removed registration

---

## 📡 Integration with app-dynamic.js

### How Provider Registration Starts

In `app-dynamic.js` main initialization:

```javascript
srf.on('connect', async (err, srf) => {
  if (err) return logger.error({ err }, 'Connection error');

  logger.info({ endpoints: srf.listConnections() }, 'connected to drachtio');
  
  // Load SIP config
  await fetchSipConfig(srf);
  
  // Load and process trunks
  await initializeTrunks(srf, logger);
  
  // PROVIDER REGISTRATION - Starts here!
  await initializeProviderRegistrations(srf, logger);
  
  // Start call routing
  routeInboundCalls(srf, logger);
});
```

### Expected Log Sequence

When Drachtio starts:
```
connected to drachtio listening on tcp/[::1]:5060,udp/...
Ready to receive SIP calls - routing to LiveKit
✅ SIP config fetched successfully
📡 Initializing Provider Registrations
📋 Provider registrations fetched from backend
📤 Sending REGISTER request to provider: sipv2.wavoip.com
✅ Provider registration successful (expires in 3600s)
✅ Provider registration status updated in backend
✅ Provider registration initialization completed
⏱️  Provider registration refresh scheduled (every 5 minutes)
```

---

## 🚨 Error Handling & Debugging

### Common Issues

#### Issue 1: "Failed to update provider registration status in backend"
**Symptom**: Registration succeeds (200 OK) but Drachtio can't update backend

**Causes**:
- Backend URL incorrect or unreachable
- API Key missing or invalid
- Backend endpoint path wrong (now `/api/sip/provider-registration/:id`)
- Network timeout

**Debug**:
```bash
# Check if backend is reachable
curl -I https://vendor-api.up.railway.app/api/sip/config \
  -H "x-api-key: YOUR_API_KEY"

# Check logs for the actual error
docker logs -f drachtio-controller 2>&1 | grep -i "failed to update"
```

#### Issue 2: "ReferenceError: destinationUri is not defined"
**Symptom**: B2BUA request fails and crash occurs

**Fix**: `destinationUri` is now initialized at function scope (Line 54)

**Verification**:
```javascript
// Line 54 - NOW OUTSIDE TRY BLOCK
let destinationUri = `sip:${did}@${livekitDomain}`; // Default

try {
  // Get destination from API
  const destination = await getDestinationUri(backendUrl, did, this.logger);
  destinationUri = destination.destinationUri;
} catch (err) {
  // Fallback to default - destinationUri is still defined
}
```

#### Issue 3: HTTP 404 on status update
**Symptom**: Backend returns 404, status not saved

**Root Cause**: Endpoint path missing `/api` prefix

**Fix Applied**: Line 345 in provider-registration.js
```javascript
// BEFORE
const endpoint = `${backendUrl}/sip/provider-registration/${providerId}`;

// AFTER
const endpoint = `${backendUrl}/api/sip/provider-registration/${providerId}`;
```

### How to Read Logs

**Live Logs**:
```bash
docker logs -f drachtio-controller
```

**Filter for Provider Registration**:
```bash
docker logs -f drachtio-controller 2>&1 | grep -E "(Provider registration|status updated|❌|✅)"
```

**Filter for Specific Provider ID**:
```bash
docker logs -f drachtio-controller 2>&1 | grep "cmimlnwfz0006pd01vy4npun2"
```

**Log Levels** (pino logger):
- `30`: Info (✅ success)
- `40`: Warn (⚠️ issues)
- `50`: Error (❌ failures)

---

## 🔧 Environment Variables

### Required
```bash
BACKEND_URL=https://vendor-api.up.railway.app
API_KEY=XsqdC...lXtVd
```

### Optional (with defaults)
```bash
LOG_LEVEL=30  # pino log level (30=info, 40=warn, 50=error)
SIP_LISTEN_ADDRESS=0.0.0.0
SIP_PORT=5060
RTP_ENGINE_PORT=22222
```

### Setting in Docker
```dockerfile
# Dockerfile
ENV BACKEND_URL=https://vendor-api.up.railway.app
ENV API_KEY=${API_KEY}  # Set at build time
```

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIP Provider Registration Flow                │
└─────────────────────────────────────────────────────────────────┘

1. INITIALIZATION (app startup)
   ├─ app-dynamic.js connects to drachtio controller
   ├─ Calls initializeProviderRegistrations()
   └─ Fetches list from backend API

2. FOR EACH PROVIDER
   ├─ registerWithProvider()
   │  ├─ Create SIP REGISTER request
   │  ├─ Send to SIP provider (e.g., WaVoIP)
   │  └─ Wait for 200 OK response (or error)
   │
   ├─ updateProviderRegistrationStatus()
   │  ├─ Send PATCH to backend with status
   │  ├─ Include: registerStatus, registerError, lastRegisterAt
   │  └─ Backend saves to PostgreSQL database
   │
   └─ scheduleProviderRefresh()
      └─ Schedule re-registration before expiry

3. PERIODIC REFRESH (every 5 minutes)
   └─ startProviderRegistrationRefresh()
      └─ Restart from step 2

4. FRONTEND POLLING (every 10 seconds)
   └─ GET /api/sip/provider-registration
      └─ Shows status from database to user
```

---

## 🔄 Key Data Transformations

### From Backend DTO to SIP REGISTER

```javascript
// Input from backend API
{
  id: "cmimlnwfz0006pd01vy4npun2",
  host: "sipv2.wavoip.com",
  username: "W81b8ea99dd62",
  password: "encrypted-password",
  transport: "SIP_TRANSPORT_UDP",
  port: 5060
}

// Transformed to SIP Headers
{
  From: "sip:W81b8ea99dd62@sipv2.wavoip.com",
  To: "sip:W81b8ea99dd62@sipv2.wavoip.com",
  Contact: "sip:W81b8ea99dd62@172.31.2.132:5060;transport=UDP",
  Expires: "3600",
  Authorization: "Basic W81iZWE5OWRkNjI6cGFzcw=="  // base64(user:pass)
}
```

### From SIP Response to Backend Update

```javascript
// SIP 200 OK Response
{
  status: 200,
  headers: {
    'expires': '3600',
    'contact': 'sip:W81b8ea99dd62@provider.com:5060'
  }
}

// Transformed to Backend PATCH body
{
  registerStatus: "registered",
  registerError: null,
  lastRegisterAt: "2025-12-01T04:03:18.612Z"
}
```

---

## 🧪 Testing Procedures

### 1. Manual Registration Test
```bash
# SSH into EC2 instance
ssh -i your-key.pem ec2-user@your-instance-ip

# Go to drachtio folder
cd /home/ubuntu/vendor-drachtio

# Check if drachtio is running
docker ps | grep drachtio

# View logs
docker logs drachtio-controller | tail -50
```

### 2. Trigger Manual Registration
```bash
# Call the trigger endpoint from backend
curl -X POST https://vendor-api.up.railway.app/api/sip/provider-registration/{id}/register \
  -H "x-api-key: YOUR_API_KEY"

# Check logs for response
docker logs -f drachtio-controller | grep "cmimlnwfz0006pd01vy4npun2"
```

### 3. Verify Status in Database
```bash
# SSH to Railway PostgreSQL (if accessible)
# Or use Railway UI to query

SELECT registerStatus, lastRegisterAt, nextRefreshAt
FROM "ProviderRegistration"
WHERE id = 'cmimlnwfz0006pd01vy4npun2';
```

---

## 📚 Key Files Reference

| File | Purpose | Key Functions |
|------|---------|---------------|
| `lib/provider-registration.js` | Provider registration logic | initializeProviderRegistrations, registerWithProvider, updateProviderRegistrationStatus |
| `lib/app-dynamic.js` | Main app entry point | Initializes provider registration on startup |
| `lib/call-session-dynamic.js` | Inbound call handling | Handles incoming SIP calls, B2BUA to LiveKit |
| `lib/sip-config.js` | SIP config management | Fetches and caches SIP configuration |

---

## 🚀 Deployment

### Docker Build & Push
```bash
# Build image
docker build -t drachtio:latest .

# Tag for registry
docker tag drachtio:latest your-registry/drachtio:latest

# Push
docker push your-registry/drachtio:latest
```

### EC2 Deployment
```bash
# SSH to EC2
ssh -i key.pem ubuntu@instance-ip

# Pull latest
cd /home/ubuntu/vendor-drachtio
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d

# Check logs
docker logs -f drachtio-controller
```

### Environment Setup
```bash
# Create .env file
cat > .env << EOF
BACKEND_URL=https://vendor-api.up.railway.app
API_KEY=XsqdC...lXtVd
DRACHTIO_HOST=localhost
DRACHTIO_PORT=9022
RTP_ENGINE_PORT=22222
EOF

# Load in docker-compose.yml
env_file:
  - .env
```

---

## 🔐 Security Considerations

### Password Handling
- Passwords stored encrypted in PostgreSQL (encrypted at rest)
- Passed to SIP provider via HTTP BASIC AUTH in SIP headers
- Never logged in plaintext
- Transmitted over HTTPS when possible

### API Authentication
- All backend requests require `x-api-key` header
- API key validated by backend middleware
- Keys should be rotated periodically

### Network Security
- Drachtio firewall: Only SIP port 5060 exposed
- Backend API: HTTPS only
- RtpEngine: Internal network only

---

## 🔗 Related Documentation
- **Backend**: See `DEVELOPMENT.md` in vendor-backend-nestjs
- **Frontend**: See `DEVELOPMENT.md` in vendor-frontend
- **SIP Protocol**: RFC 3261 (REGISTER method)
- **Drachtio Docs**: https://drachtio.org

---

## 📝 Recent Changes (Dec 1, 2025)

### Fixed Issues
1. ✅ Endpoint path missing `/api` prefix (Line 345)
2. ✅ Response logging for status updates (Lines 360-366)
3. ✅ destinationUri ReferenceError in error handler
4. ✅ Improved error response handling with finalResponseSent check

### Deployed Commit
```
1c3a034 fix: correct provider registration status update endpoint and add comprehensive error logging
```

---

## 🎓 For New Developers

### Quick Start
1. Read this file completely
2. Understand the 5 key functions in provider-registration.js
3. Trace a REGISTER request end-to-end (in logs)
4. Check backend DEVELOPMENT.md for response handling
5. Test with manual curl commands

### Important Concepts
- **SIP REGISTER**: Method to register with SIP server, expires after timeout
- **UAC** (User Agent Client): Drachtio sends REGISTER, waits for response
- **200 OK**: Successful registration
- **401 Unauthorized**: Bad credentials
- **Handle**: Internal Drachtio reference to keep registration alive

### Testing Checklist
- [ ] Backend API reachable (curl test)
- [ ] API Key valid (200 response)
- [ ] Provider credentials correct
- [ ] Logs show "✅ Provider registration successful"
- [ ] Backend receives PATCH request
- [ ] Database shows "registered" status

---

*Last Updated: Dec 1, 2025 - 04:45 UTC*
*Documented by: AI Assistant*
*Status: SIP Provider Registration 95% Complete*
