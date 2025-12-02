const axios = require('axios');
const debug = require('debug')('drachtio:vendor-drachtio');

/**
 * Fetch provider registrations from backend API and maintain SIP registrations
 * This handles inbound provider registrations (where Drachtio registers with providers)
 *
 * @param {Object} srf - Drachtio SRF instance
 * @param {Object} logger - Logger instance
 */
async function initializeProviderRegistrations(srf, logger) {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://backend:3000';
    const endpoint = `${backendUrl}/sip/provider-registration`;

    logger.info({ endpoint }, '📡 Initializing Provider Registrations');

    // Query backend API for all active provider registrations
    const response = await axios.get(endpoint, { timeout: 5000 });
    const providers = response.data || [];

    if (!providers || providers.length === 0) {
      logger.info('ℹ️  No provider registrations returned from backend');
      return {};
    }

    logger.info(
      { count: providers.length },
      '📋 Provider registrations fetched from backend',
    );

    // Track active registrations with their handles
    const activeRegistrations = {};

    // Register with each active provider
    for (const provider of providers) {
      if (!provider.isActive) {
        logger.debug({ providerName: provider.name }, '⏭️  Skipping inactive provider');
        continue;
      }

      try {
        const handle = await registerWithProvider(srf, provider, logger);
        activeRegistrations[provider.id] = {
          name: provider.name,
          host: provider.host,
          handle,
          nextRefreshAt: new Date(provider.nextRefreshAt),
        };
        
        // Update backend with registration success
        await updateProviderRegistrationStatus(
          provider.id,
          'registered',
          null,
          logger,
        );
        
        // Schedule refresh based on expiration
        scheduleProviderRefresh(srf, provider, activeRegistrations, logger);
      } catch (err) {
        logger.error(
          { error: err.message, providerName: provider.name },
          '❌ Failed to register with provider',
        );
        
        // Update backend with registration failure
        await updateProviderRegistrationStatus(
          provider.id,
          'failed',
          err.message,
          logger,
        );
        // Continue with next provider
      }
    }

    logger.info(
      { count: Object.keys(activeRegistrations).length },
      '✅ Provider registration initialization completed',
    );

    return activeRegistrations;
  } catch (err) {
    logger.error(
      { error: err.message, url: process.env.BACKEND_URL },
      '⚠️  Failed to fetch provider registrations from backend',
    );
    // Non-fatal - app continues but without provider registrations
    return {};
  }
}

/**
 * Register with a single provider
 *
 * @param {Object} srf - Drachtio SRF instance
 * @param {Object} provider - Provider config from backend
 * @param {Object} logger - Logger instance
 * @returns {Promise<string>} Registration handle for tracking
 */
async function registerWithProvider(srf, provider, logger) {
  const { id, name, host, username, password, transport = 'UDP', port = 5060, expiration = 3600 } = provider;

  // Basic validation
  if (!host || !username || !password) {
    const missing = [];
    if (!host) missing.push('host');
    if (!username) missing.push('username');
    if (!password) missing.push('password');
    
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  // Ensure we have the public IP for Contact header
  const publicIp = process.env.PUBLIC_IP;
  if (!publicIp) {
    throw new Error('PUBLIC_IP environment variable not set. Cannot register with provider.');
  }

  const registrarUri = `sip:${host}:${port}`;
  const transportLower = (transport || 'UDP').toLowerCase();
  const publicSipPort = process.env.PUBLIC_SIP_PORT || 5060;

  // Build Contact URI pointing back to Drachtio
  // Format: sip:publicIP:port;transport=udp
  // This tells the registrar WHERE to send INVITEs
  const contactUri = `sip:${publicIp}:${publicSipPort};transport=${transportLower}`;

  const opts = {
    method: 'REGISTER',
    uri: registrarUri,
    headers: {
      'To': `sip:${username}@${host}`,
      'From': `sip:${username}@${host}`,
      'Contact': `<${contactUri}>`,
      'Expires': String(expiration),
      'User-Agent': 'DrachtioAI/1.0',
      'Call-ID': `preg-${id}-${Date.now()}@${publicIp}`,
    },
    auth: {
      username,
      password,
    },
  };

  logger.info(
    { providerName: name, registrar: host, username, contactUri, publicIp, port: publicSipPort, transport: transportLower },
    `📤 Sending REGISTER request to provider: ${host}`,
  );

  return new Promise((resolve, reject) => {
    srf.request(registrarUri, opts, (err, req) => {
      if (err) {
        logger.error(
          { error: err.message, providerName: name },
          '❌ Network error sending REGISTER',
        );
        return reject(err);
      }

      req.on('response', (res) => {
        // 200 OK - Registration successful
        if (res.status === 200) {
          const expiresHeader = res.get('Expires') || String(expiration);
          const expiresSeconds = parseInt(expiresHeader);

          logger.info(
            { providerName: name, expires: expiresSeconds },
            `✅ Provider registration successful (expires in ${expiresSeconds}s)`,
          );

          // Return request handle for tracking
          resolve(req);
        }
        // 401 Unauthorized - Drachtio will handle auth challenge automatically
        else if (res.status === 401) {
          logger.debug(
            { providerName: name },
            '🔐 Got 401 Challenge - Drachtio handling authentication',
          );
          resolve(req);
        }
        // 403 Forbidden - Invalid credentials
        else if (res.status === 403) {
          logger.error(
            { providerName: name },
            '❌ Registration forbidden (403) - check credentials',
          );
          reject(new Error(`Registration forbidden: ${res.reason}`));
        }
        // Other error status
        else if (res.status >= 300) {
          logger.warn(
            { providerName: name, status: res.status, reason: res.reason },
            `⚠️  Registration failed with status ${res.status}`,
          );
          reject(new Error(`Registration failed: ${res.status} ${res.reason}`));
        }
      });

      req.on('error', (err) => {
        logger.error(
          { error: err.message, providerName: name },
          '❌ Error during registration request',
        );
        reject(err);
      });
    });
  });
}

/**
 * Schedule automatic refresh for a provider registration
 *
 * @param {Object} srf - Drachtio SRF instance
 * @param {Object} provider - Provider config
 * @param {Object} activeRegistrations - Map of active registrations
 * @param {Object} logger - Logger instance
 */
function scheduleProviderRefresh(srf, provider, activeRegistrations, logger) {
  // Refresh 60 seconds before expiration
  const refreshTime = (provider.expiration - 60) * 1000;

  const timeoutHandle = setTimeout(async () => {
    try {
      logger.info(
        { providerName: provider.name },
        '🔄 Refreshing provider registration',
      );

      const handle = await registerWithProvider(srf, provider, logger);
      activeRegistrations[provider.id].handle = handle;

      // Schedule next refresh
      scheduleProviderRefresh(srf, provider, activeRegistrations, logger);

      // Update backend with success
      await updateProviderRegistrationStatus(
        provider.id,
        'registered',
        null,
        logger,
      );
    } catch (err) {
      logger.error(
        { error: err.message, providerName: provider.name },
        '❌ Failed to refresh provider registration',
      );

      // Update backend with error
      await updateProviderRegistrationStatus(
        provider.id,
        'failed',
        err.message,
        logger,
      );
    }
  }, refreshTime);

  logger.debug(
    { providerName: provider.name, refreshInSeconds: refreshTime / 1000 },
    '⏱️  Registration refresh scheduled',
  );
}

/**
 * Manually trigger registration refresh for a specific provider
 *
 * @param {Object} srf - Drachtio SRF instance
 * @param {string} providerId - Provider ID
 * @param {Object} activeRegistrations - Map of active registrations
 * @param {Object} logger - Logger instance
 */
async function refreshProviderRegistration(
  srf,
  providerId,
  activeRegistrations,
  logger,
) {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://backend:3000';
    const endpoint = `${backendUrl}/sip/provider-registration/${providerId}`;

    // Fetch fresh provider data
    const response = await axios.get(endpoint, { timeout: 5000 });
    const provider = response.data;

    if (!provider || !provider.isActive) {
      logger.warn(
        { providerId },
        'Provider not found or inactive, skipping refresh',
      );
      return;
    }

    logger.info({ providerId }, '📤 Manually triggering provider registration');

    const handle = await registerWithProvider(srf, provider, logger);
    activeRegistrations[provider.id] = {
      name: provider.name,
      host: provider.host,
      handle,
      nextRefreshAt: new Date(provider.nextRefreshAt),
    };

    // Reschedule refresh
    scheduleProviderRefresh(srf, provider, activeRegistrations, logger);

    // Update backend
    await updateProviderRegistrationStatus(
      provider.id,
      'registered',
      null,
      logger,
    );
  } catch (err) {
    logger.error(
      { error: err.message, providerId },
      '❌ Failed to manually refresh provider registration',
    );
    await updateProviderRegistrationStatus(
      providerId,
      'failed',
      err.message,
      logger,
    );
  }
}

/**
 * Update provider registration status in backend
 *
 * @param {string} providerId - Provider ID
 * @param {string} status - Registration status (pending, registered, failed)
 * @param {string} error - Error message if status is failed
 * @param {Object} logger - Logger instance
 */
async function updateProviderRegistrationStatus(
  providerId,
  status,
  error,
  logger,
) {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://backend:3000';
    const apiKey = process.env.API_KEY || 'default-api-key';
    const endpoint = `${backendUrl}/sip/provider-registration/${providerId}`;

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

    logger.info(
      { providerId, status, endpoint, responseStatus: response.status, responseData: response.data },
      '✅ Provider registration status updated in backend',
    );
    
    return response.data;
  } catch (err) {
    logger.error(
      { error: err.message, providerId, status, statusCode: err.response?.status, responseData: err.response?.data },
      '⚠️  Failed to update provider registration status in backend',
    );
    // Non-fatal - registration worked, just status update failed
    // This will be corrected on next 5-minute refresh
  }
}

/**
 * Start periodic refresh of all provider registrations
 *
 * @param {Object} srf - Drachtio SRF instance
 * @param {Object} logger - Logger instance
 */
function startProviderRegistrationRefresh(srf, logger) {
  // Fetch fresh registrations every 5 minutes
  const REFRESH_INTERVAL = 5 * 60 * 1000;

  setInterval(async () => {
    try {
      logger.debug('🔄 Refreshing provider registrations list from backend');
      await initializeProviderRegistrations(srf, logger);
    } catch (err) {
      logger.error(
        { error: err.message },
        '⚠️  Error refreshing provider registrations',
      );
    }
  }, REFRESH_INTERVAL);

  logger.info(
    '⏱️  Provider registration refresh scheduled (every 5 minutes)',
  );
}

module.exports = {
  initializeProviderRegistrations,
  refreshProviderRegistration,
  startProviderRegistrationRefresh,
};
