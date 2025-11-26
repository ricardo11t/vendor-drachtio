const axios = require('axios');
const debug = require('debug')('drachtio:vendor-drachtio');

/**
 * Fetch SIP configuration from backend API
 * Replaces hardcoded environment variables
 *
 * @param {String} backendUrl - Backend API base URL
 * @param {Object} logger - Pino logger instance
 * @returns {Promise<Object>} SIP configuration object
 */
async function fetchSipConfig(backendUrl, logger) {
  try {
    const apiKey = process.env.VENDOR_API_KEY || 'default-api-key';
    logger?.info(`🔗 Fetching SIP config from: ${backendUrl}/sip/config`);
    logger?.info(`🔐 Using API Key: ${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 5)}`);
    
    const response = await axios.get(`${backendUrl}/sip/config`, {
      timeout: 5000,
      headers: {
        'x-api-key': apiKey
      }
    });
    
    logger?.info('✅ SIP config fetched successfully');
    logger?.debug({ configKeys: Object.keys(response.data) }, '📋 Configuration keys received');
    
    return response.data;
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    const statusCode = err.response?.status || 'N/A';
    console.error(`Failed to fetch SIP config from backend [${statusCode}]:`, errorMsg);
    logger?.error({ 
      statusCode, 
      message: errorMsg,
      url: `${backendUrl}/sip/config`
    }, '❌ SIP config fetch failed');
    throw err;
  }
}

/**
 * Lookup inbound DID to determine routing
 *
 * @param {String} backendUrl - Backend API base URL
 * @param {String} did - DID/phone number to lookup
 * @param {Object} logger - Pino logger instance
 * @returns {Promise<Object>} DID lookup result with dispatch rule
 */
async function lookupInboundDid(backendUrl, did, logger) {
  try {
    const apiKey = process.env.VENDOR_API_KEY || 'default-api-key';
    logger?.info({ did }, `🔎 Lookup DID: ${backendUrl}/sip/inbound/lookup/${did}`);
    logger?.debug(`🔐 Using API Key: ${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 5)}`);
    
    const response = await axios.get(`${backendUrl}/sip/inbound/lookup/${did}`, {
      timeout: 5000,
      headers: {
        'x-api-key': apiKey
      }
    });
    
    logger?.info({ did, result: response.data }, '✅ DID lookup successful');
    return response.data;
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    const statusCode = err.response?.status || 'N/A';
    console.error(`Failed to lookup DID ${did} [${statusCode}]:`, errorMsg);
    logger?.error({ 
      did,
      statusCode, 
      message: errorMsg,
      url: `${backendUrl}/sip/inbound/lookup/${did}`
    }, '❌ DID lookup failed');
    throw err;
  }
}

/**
 * Get SIP destination URI for a DID
 * Used by Drachtio to determine where to route the call
 *
 * @param {String} backendUrl - Backend API base URL
 * @param {String} did - DID/phone number
 * @param {Object} logger - Pino logger instance
 * @returns {Promise<Object>} Destination URI and metadata
 */
async function getDestinationUri(backendUrl, did, logger) {
  try {
    const apiKey = process.env.VENDOR_API_KEY|| 'default-api-key';
    logger?.info({ did }, `🎯 Get destination URI: ${backendUrl}/sip/destination/${did}`);
    logger?.debug(`🔐 Using API Key: ${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 5)}`);
    
    const response = await axios.get(`${backendUrl}/sip/destination/${did}`, {
      timeout: 5000,
      headers: {
        'x-api-key': apiKey
      }
    });
    
    logger?.info({ did, destinationUri: response.data.destinationUri }, '✅ Destination URI retrieved');
    logger?.debug({ did, fullResponse: response.data }, '📋 Full destination response');
    return response.data;
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    const statusCode = err.response?.status || 'N/A';
    console.error(`Failed to get destination URI for ${did} [${statusCode}]:`, errorMsg);
    logger?.error({ 
      did,
      statusCode, 
      message: errorMsg,
      url: `${backendUrl}/sip/destination/${did}`
    }, '❌ Get destination failed');
    throw err;
  }
}

module.exports = {
  fetchSipConfig,
  lookupInboundDid,
  getDestinationUri,
};
