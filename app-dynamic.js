const Srf = require('drachtio-srf');
const srf = new Srf();
const Redis = require('ioredis');

// ============================================================
// LOGGER SETUP
// ============================================================
const logger = require('pino')({
  timestamp: () => `, "time": "${new Date().toISOString()}"`,
  level: process.env.LOGLEVEL || 'info'
});

// ============================================================
// DEPENDENCIES
// ============================================================
const { initLocals, checkCache, challenge, checkIpWhitelist } = require('./lib/middleware')(logger);
const regParser = require('drachtio-mw-registration-parser');
const Registrar = require('@jambonz/mw-registrar');
const CallSession = require('./lib/call-session-dynamic');
const { fetchSipConfig } = require('./lib/sip-config');
const { initializeProviderRegistrations, startProviderRegistrationRefresh } = require('./lib/provider-registration');
const { registerOutboundTrunks, startRegistrationRefresh } = require('./lib/outbound-registration');

// ============================================================
// REDIS CLIENT
// ============================================================
const redisClient = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
});

srf.locals.registrar = new Registrar(logger, redisClient);

// ============================================================
// SIP CONFIG CACHING
// ============================================================
let sipConfigCache = null;
const CONFIG_TTL = 5 * 60 * 1000; // 5 minutes
let configCacheTime = 0;

async function getSipConfig() {
  const now = Date.now();

  // Use cached config if still valid
  if (sipConfigCache && (now - configCacheTime) < CONFIG_TTL) {
    logger.debug('Using cached SIP config');
    return sipConfigCache;
  }

  // Fetch fresh config from backend
  const backendUrl = process.env.BACKEND_URL || 'http://backend:3000';

  try {
    sipConfigCache = await fetchSipConfig(backendUrl, logger);
    configCacheTime = now;
    logger.info('✅ SIP config fetched from backend and cached');
    return sipConfigCache;
  } catch (err) {
    logger.error({ error: err.message }, 'Failed to fetch SIP config from backend');

    // If we have cached config, use it as fallback
    if (sipConfigCache) {
      logger.warn('Backend unavailable, using cached SIP config');
      return sipConfigCache;
    }

    // Critical error: no backend, no cache
    logger.error('❌ CRITICAL: Cannot load SIP config from backend and no cache available');
    throw err;
  }
}

// ============================================================
// DRACHTIO CONNECTION
// ============================================================
srf.connect({
  host: process.env.DRACHTIO_HOST || '127.0.0.1',
  port: process.env.DRACHTIO_PORT || 9022,
  secret: process.env.DRACHTIO_SECRET || 'cymru'
});

srf.on('error', (err) => {
  logger.error({ error: err.message }, 'Drachtio connection error. Retrying...');
});

srf.on('connect', async (err, hp) => {
  if (err) {
    logger.error({ error: err.message }, 'Error connecting to drachtio');
    return;
  }

  logger.info({ host: hp }, 'connected to drachtio listening on tcp/udp');
  logger.info('Ready to receive SIP calls - routing to LiveKit');

  // ========================================================
  // FETCH SIP CONFIG AT STARTUP
  // ========================================================
  try {
    logger.info({ endpoint: `${process.env.BACKEND_URL || 'http://backend:3000'}/api/sip/config` }, '🔗 Fetching SIP config from: https://vendor-api.up.railway.app/api/sip/config');
    logger.info(`🔐 Using API Key: ${process.env.VENDOR_API_KEY?.substring(0, 5)}...${process.env.VENDOR_API_KEY?.substring(-5)}`);
    srf.locals.sipConfig = await getSipConfig();
    logger.info('✅ SIP config loaded on startup');
  } catch (err) {
    logger.error({ error: err.message }, 'Failed to load SIP config on startup');
  }

  // ========================================================
  // REGISTER OUTBOUND TRUNKS
  // ========================================================
  try {
    await registerOutboundTrunks(srf, logger);
    startRegistrationRefresh(srf, logger);
  } catch (err) {
    logger.error({ error: err.message }, 'Error registering outbound trunks');
    // Non-fatal: continue without outbound trunks
  }

  // ========================================================
  // INITIALIZE PROVIDER REGISTRATIONS
  // ========================================================
  try {
    srf.locals.activeProviderRegistrations = await initializeProviderRegistrations(srf, logger);
    startProviderRegistrationRefresh(srf, logger);
  } catch (err) {
    logger.error({ error: err.message }, 'Error initializing provider registrations');
    // Non-fatal: continue without provider registrations
  }
});

// ============================================================
// MIDDLEWARE (MUST BE BEFORE HANDLERS)
// ============================================================
srf.use([initLocals]);
srf.use('register', [regParser, checkCache, challenge]);

// ============================================================
// HANDLERS
// ============================================================

// INVITE Handler - Main call routing
srf.invite(async (req, res) => {
  const callId = req.get('Call-ID');
  const uri = req.uri;
  const from = req.get('From');
  const to = req.get('To');
  const source = `${req.source_address}:${req.source_port}`;
  const contentType = req.get('Content-Type');
  const contentLength = req.get('Content-Length');

  logger.info({ 
    callId, 
    uri, 
    from, 
    to, 
    source, 
    contentType,
    contentLength,
    hasSdp: !!req.raw
  }, '🎯 INVITE HANDLER TRIGGERED - Processing call');

  try {
    // Refresh SIP config before each call (cached)
    try {
      req.srf.locals.sipConfig = await getSipConfig();
      logger.info({ callId }, '✅ SIP config loaded for this call');
    } catch (configErr) {
      logger.error({ error: configErr.message, callId }, 'Failed to get SIP config for call');
      return res.send(503, 'Service Unavailable');
    }

    // Create and start call session
    const session = new CallSession(req, res);
    logger.info({ callId }, '▶️  Starting CallSession.connect()');
    session.connect();
  } catch (err) {
    logger.error({ error: err.message, callId }, '❌ Error in INVITE handler');
    if (!res.finalResponseSent) {
      res.send(500, 'Internal Server Error');
    }
  }
});

// REGISTER Handler
srf.register(require('./lib/register')({ logger }));

// SUBSCRIBE Handler
srf.subscribe(require('./lib/subscribe')({ logger }));

// PUBLISH Handler
srf.publish(require('./lib/publish')({ logger }));

// MESSAGE Handler
srf.message(require('./lib/message')({ logger }));

// OPTIONS Handler
srf.options(require('./lib/options')({ logger }));

// INFO Handler
srf.info(require('./lib/info')({ logger }));

// ============================================================
// TEST MODE EXPORT
// ============================================================
if ('test' === process.env.NODE_ENV) {
  const disconnect = () => {
    return new Promise((resolve) => {
      srf.disconnect();
      resolve();
    });
  };

  module.exports = { srf, logger, disconnect };
}
