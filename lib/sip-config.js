const axios = require('axios');
const debug = require('debug')('drachtio:vendor-drachtio');

/**
 * Fetch SIP configuration from backend API
 * Replaces hardcoded environment variables
 *
 * @param {String} backendUrl - Backend API base URL
 * @returns {Promise<Object>} SIP configuration object
 */
async function fetchSipConfig(backendUrl) {
  try {
    const response = await axios.get(`${backendUrl}/sip/config`, { timeout: 5000 });
    return response.data;
  } catch (err) {
    console.error('Failed to fetch SIP config from backend:', err.message);
    throw err;
  }
}

/**
 * Lookup inbound DID to determine routing
 *
 * @param {String} backendUrl - Backend API base URL
 * @param {String} did - DID/phone number to lookup
 * @returns {Promise<Object>} DID lookup result with dispatch rule
 */
async function lookupInboundDid(backendUrl, did) {
  try {
    const response = await axios.get(`${backendUrl}/sip/inbound/lookup/${did}`, {
      timeout: 5000,
    });
    return response.data;
  } catch (err) {
    console.error(`Failed to lookup DID ${did}:`, err.message);
    throw err;
  }
}

/**
 * Get SIP destination URI for a DID
 * Used by Drachtio to determine where to route the call
 *
 * @param {String} backendUrl - Backend API base URL
 * @param {String} did - DID/phone number
 * @returns {Promise<Object>} Destination URI and metadata
 */
async function getDestinationUri(backendUrl, did) {
  try {
    const response = await axios.get(`${backendUrl}/sip/destination/${did}`, {
      timeout: 5000,
    });
    return response.data;
  } catch (err) {
    console.error(`Failed to get destination URI for ${did}:`, err.message);
    throw err;
  }
}

module.exports = {
  fetchSipConfig,
  lookupInboundDid,
  getDestinationUri,
};
