const Srf = require('drachtio-srf');
const srf = new Srf();
const opts = Object.assign(
  {
    timestamp: () => {
      return `, "time": "${new Date().toISOString()}"`;
    },
  },
  { level: process.env.LOGLEVEL || 'info' },
);
const logger = require('pino')(opts);
const { initLocals, checkCache, challenge, checkIpWhitelist } =
  require('./lib/middleware')(logger);
const regParser = require('drachtio-mw-registration-parser');
const Registrar = require('@jambonz/mw-registrar');
const CallSession = require('./lib/call-session');
const Redis = require('ioredis');
const {
  registerOutboundTrunks,
  startRegistrationRefresh,
} = require('./lib/outbound-registration');
const { fetchSipConfig } = require('./lib/sip-config');

const redisClient = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
});

srf.locals.registrar = new Registrar(logger, redisClient);

// SIP configuration cache (refreshed periodically)
let sipConfigCache = null;
const CONFIG_TTL = 5 * 60 * 1000; // 5 minutes
let configCacheTime = 0;

/**
 * Get SIP config from backend or use cached version
 */
async function getSipConfig() {
  const now = Date.now();
  
  // Return cached config if still valid
  if (sipConfigCache && (now - configCacheTime) < CONFIG_TTL) {
    logger.debug('Using cached SIP config');
    return sipConfigCache;
  }

  // Fetch fresh config from backend
  const backendUrl = process.env.BACKEND_URL || 'http://backend:8002';
  try {
    sipConfigCache = await fetchSipConfig(backendUrl, logger);
    configCacheTime = now;
    logger.info('✅ SIP config fetched from backend and cached');
    return sipConfigCache;
  } catch (err) {
    logger.error({ err }, 'Failed to fetch SIP config from backend');
    
    // If backend is unavailable, try to use previously cached config
    if (sipConfigCache) {
      logger.warn('Backend unavailable, using cached SIP config');
      return sipConfigCache;
    }
    
    // Se não conseguir buscar da API e não há cache, erro crítico
    logger.error('❌ CRITICAL: Cannot load SIP config from backend and no cache available');
    throw new Error('Failed to load SIP configuration from backend API');
  }
}

srf.connect({
  host: process.env.DRACHTIO_HOST || '127.0.0.1',
  port: process.env.DRACHTIO_PORT || 9022,
  secret: process.env.DRACHTIO_SECRET || 'cymru',
});

srf.on('error', (err) => {
  logger.error(err, 'Erro na conxão com o Drachtio. Aguardando...');
});

srf.on('connect', async (err, hp) => {
  if (err) return logger.error({ err }, 'Error connecting to drachtio');
  logger.info(`connected to drachtio listening on ${hp}`);
  logger.info('Ready to receive SIP calls - routing to LiveKit');

  // Pre-load SIP config
  try {
    srf.locals.sipConfig = await getSipConfig();
    logger.info('✅ SIP config loaded on startup');
  } catch (err) {
    logger.error({ err }, 'Failed to load SIP config on startup');
  }

  // Register all outbound trunks from backend
  try {
    await registerOutboundTrunks(srf, logger);
    startRegistrationRefresh(srf, logger);
  } catch (err) {
    logger.error({ err }, 'Error registering outbound trunks');
    // Non-fatal error - continue anyway
  }
});

srf.invite([initLocals], async (req, res) => {
  // Refresh SIP config before each call (with cache)
  try {
    req.srf.locals.sipConfig = await getSipConfig();
  } catch (err) {
    logger.error({ err }, 'Failed to get SIP config for call');
  }
  
  const session = new CallSession(req, res);
  session.connect();
});

srf.use('register', [initLocals, regParser, checkCache, challenge]);
srf.register(require('./lib/register')({ logger }));
srf.subscribe(require('./lib/subscribe')({ logger }));
srf.publish(require('./lib/publish')({ logger }));
srf.message(require('./lib/message')({ logger }));
srf.options(require('./lib/options')({ logger }));
srf.info(require('./lib/info')({ logger }));

if ('test' === process.env.NODE_ENV) {
  const disconnect = () => {
    return new Promise((resolve) => {
      srf.disconnect();
      resolve();
    });
  };

  module.exports = { srf, logger, disconnect };
}
