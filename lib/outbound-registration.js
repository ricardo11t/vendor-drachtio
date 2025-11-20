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
async function registerTrunk(srf, trunk, logger) {
  const { name, provider, address, authUsername, authPassword } = trunk;

  // Validate required fields
  if (!address || !authUsername || !authPassword) {
    logger.warn(
      { trunkName: name, provider },
      'Trunk missing auth credentials - skipping',
    );
    return;
  }

  logger.info(
    { trunkName: name, provider, address },
    `Registering trunk with ${provider}`,
  );

  try {
    // Create REGISTER request to SIP provider
    const registrarUri = `sip:${address}`;
    const publicIp = process.env.PUBLIC_IP || '100.25.218.14';
    const publicPort = process.env.PUBLIC_SIP_PORT || 5060;
    const transport = (trunk.transport || 'udp').toLowerCase();
    const contactUri = `sip:${authUsername}@${publicIp}:${publicPort};transport=${transport}`;

    const opts = {
      headers: {
        Contact: `<${contactUri}>`,
        Expires: '3600',
        'User-Agent': 'drachtio-vendor/1.0',
      },
      method: 'REGISTER',
      auth: {
        username: authUsername,
        password: authPassword,
        realm: address, // Use provider address as realm
      },
    };

    debug(
      { trunkName: name, registrarUri, contactUri },
      'Sending REGISTER to provider',
    );

    // Send REGISTER via Drachtio
    const res = await srf.createUAC(registrarUri, opts);

    if (res.status === 200 || res.status === 401) {
      // 200 = success, 401 = challenge (normal SIP auth flow)
      logger.info(
        { trunkName: name, provider, status: res.status },
        'Registered with provider',
      );

      // Schedule re-registration before expiry
      const expiresHeader = res.get('Expires') || '3600';
      const expiresSeconds = parseInt(expiresHeader);
      const reregisterInterval = Math.max(expiresSeconds - 300, 60) * 1000;

      logger.debug(
        {
          trunkName: name,
          reregisterInterval: `${reregisterInterval / 1000}s`,
        },
        'Will re-register',
      );

      // Re-register periodically
      setInterval(() => {
        registerTrunk(srf, logger, trunk).catch((err) => {
          logger.error(
            { trunkName: name, error: err.message },
            'Re-registration failed',
          );
        });
      }, reregisterInterval);

      return true;
    } else {
      logger.error(
        { trunkName: name, status: res.status, reason: res.reason },
        'Provider rejected REGISTER',
      );
      return false;
    }
  } catch (err) {
    logger.error(
      { trunkName: name, error: err.message },
      'Error registering trunk',
    );
    throw err;
  }
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
