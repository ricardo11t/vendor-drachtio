const axios = require('axios');
const debug = require('debug')('drachtio:vendor-drachtio');

/**
 * Fetch outbound trunks from backend API and register with SIP providers
 * This avoids database dependencies in the Drachtio container
 *
 * @param {Object} srf - Drachtio SRF instance
 * @param {Object} logger - Logger instance
 */
async function registerOutboundTrunks(srf, logger) {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://backend:3000';
    const endpoint = `${backendUrl}/sip/trunk/outbound`;

    logger.info({ endpoint }, 'Fetching outbound trunks from backend');

    // Query backend API for all outbound trunks
    const response = await axios.get(endpoint, { timeout: 5000 });
    const trunks = response.data || [];

    if (!trunks || trunks.length === 0) {
      logger.info('No outbound trunks returned from backend');
      return;
    }

    logger.info(
      { count: trunks.length },
      'Outbound trunks fetched from backend',
    );

    // Register each active trunk
    for (const trunk of trunks) {
      if (!trunk.isActive) {
        logger.debug({ trunkName: trunk.name }, 'Skipping inactive trunk');
        continue;
      }

      try {
        await registerTrunk(srf, trunk, logger);
      } catch (err) {
        logger.error(
          { error: err.message, trunkName: trunk.name },
          'Failed to register trunk',
        );
        // Continue with next trunk
      }
    }

    logger.info('Outbound trunk registration completed');
  } catch (err) {
    logger.error(
      { error: err.message, url: process.env.BACKEND_URL },
      'Failed to fetch outbound trunks from backend - registration skipped',
    );
    // Non-fatal - app continues but without registrations
  }
}

/**
 * Register a single outbound trunk with its SIP provider
 *
 * @param {Object} srf - Drachtio SRF instance
 * @param {Object} trunk - Outbound trunk config from backend
 * @param {Object} logger - Logger instance
 */
/**
 * Register a single outbound trunk with its SIP provider
 *
 * @param {Object} srf - Drachtio SRF instance
 * @param {Object} trunk - Outbound trunk config from backend
 * @param {Object} logger - Logger instance
 */
async function registerTrunk(srf, trunk, logger) {
  const { name, provider, address, authUsername, authPassword } = trunk;

  // Validação básica
  if (!address || !authUsername || !authPassword) return;

  // Garante que pegamos o IP certo do ambiente
  const publicIp = process.env.PUBLIC_IP; 
  if (!publicIp) {
      logger.error('CRITICAL: PUBLIC_IP not set. Registration will fail routing.');
      return;
  }

  const registrarUri = `sip:${address}`;
  const transport = (trunk.transport || 'udp').toLowerCase();
  
  // Construção correta do Contact
  const contactUri = `sip:${authUsername}@${publicIp}:${process.env.PUBLIC_SIP_PORT || 5060};transport=${transport}`;

  const opts = {
    method: 'REGISTER',
    uri: registrarUri,
    headers: {
      'To': `sip:${authUsername}@${address}`,
      'From': `sip:${authUsername}@${address}`,
      'Contact': `<${contactUri}>`,
      'Expires': '3600',
      'User-Agent': 'DrachtioAI/1.0',
      'Call-ID': `reg-${name}-${Date.now()}@${publicIp}`
    },
    auth: {
      username: authUsername,
      password: authPassword
    }
  };

  logger.info({ trunkName: name, provider }, `Sending REGISTER to ${address}...`);

  return new Promise((resolve, reject) => {
    srf.request(registrarUri, opts, (err, req) => {
      if (err) {
        logger.error({ err }, 'Network error sending REGISTER');
        return reject(err);
      }

      req.on('response', (res) => {
        // Se recebermos 200 OK, estamos registrados!
        if (res.status === 200) {
          const expires = res.get('Expires') || '3600';
          logger.info(`✅ TRUNK ${name.toUpperCase()} REGISTERED! (Expires: ${expires}s)`);
          
          // Agenda re-registro (segurança simples)
          setTimeout(() => {
             registerTrunk(srf, trunk, logger).catch(e => logger.error(e));
          }, (parseInt(expires) - 60) * 1000); // 60s antes de expirar

          resolve(true);
        } 
        // Se recebermos 401, o Drachtio SRF vai tentar reenviar automaticamente com Auth
        // Não precisamos rejeitar aqui, apenas logar.
        else if (res.status === 401) {
          logger.debug('Got 401 Challenge, Drachtio sending auth...');
        }
        else if (res.status >= 300) {
           logger.warn(`⚠️ Register failed: ${res.status} ${res.reason}`);
        }
      });
    });
  });
}

/**
 * Start periodic refresh of all trunk registrations
 *
 * @param {Object} srf - Drachtio SRF instance
 * @param {Object} logger - Logger instance
 */
function startRegistrationRefresh(srf, logger) {
  // Refresh every 25 minutes (before 30-minute SIP expiry)
  const REFRESH_INTERVAL = 25 * 60 * 1000;

  setInterval(async () => {
    try {
      logger.debug('Refreshing outbound trunk registrations');
      await registerOutboundTrunks(srf, logger);
    } catch (err) {
      logger.error({ error: err.message }, 'Error refreshing registrations');
    }
  }, REFRESH_INTERVAL);

  logger.info('Trunk registration refresh scheduled (every 25 minutes)');
}

module.exports = {
  registerOutboundTrunks,
  startRegistrationRefresh,
};
