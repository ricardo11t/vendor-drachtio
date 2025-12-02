const Emitter = require('events');
const { parseUri } = require('drachtio-srf');
const RtpEngine = require('rtpengine-client').Client;
const { getDestinationUri } = require('./sip-config');

// ============================================================
// RTPENGINE CLIENT - SINGLETON
// ============================================================
const RTPENGINE_HOST = process.env.RTPENGINE_HOST || '127.0.0.1';
const RTPENGINE_PORT = parseInt(process.env.RTPENGINE_PORT || 22222);

let rtpEngineClient = null;

const getRtpEngineClient = () => {
  if (!rtpEngineClient) {
    rtpEngineClient = new RtpEngine({
      host: RTPENGINE_HOST,
      port: RTPENGINE_PORT
    });
  }
  return rtpEngineClient;
};

// ============================================================
// RTPENGINE WRAPPER FUNCTIONS
// CRITICAL: rtpengine-client@0.4.12 signature: 
// - offer(port, host, payload, callback)
// - answer(port, host, payload, callback)
// - delete(port, host, payload, callback)
// ============================================================
const rtpOffer = async (payload) => {
  return new Promise((resolve, reject) => {
    const engine = getRtpEngineClient();
    engine.offer(RTPENGINE_PORT, RTPENGINE_HOST, payload, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
};

const rtpAnswer = async (payload) => {
  return new Promise((resolve, reject) => {
    const engine = getRtpEngineClient();
    engine.answer(RTPENGINE_PORT, RTPENGINE_HOST, payload, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
};

const rtpDelete = async (callId) => {
  return new Promise((resolve, reject) => {
    const engine = getRtpEngineClient();
    engine.delete(RTPENGINE_PORT, RTPENGINE_HOST, { 'call-id': callId }, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
};

// ============================================================
// CALL SESSION CLASS
// ============================================================
class CallSession extends Emitter {
  constructor(req, res) {
    super();
    this.req = req;
    this.res = res;
    this.srf = req.srf;
    this.logger = req.locals.logger;
    this.callId = req.get('Call-ID');
    this.did = null;
    this.callerNumber = null;
    this.destinationUri = null;
  }

  async connect() {
    try {
      // ========================================================
      // STEP 1: EXTRACT CALL INFORMATION
      // ========================================================
      this._extractCallInfo();
      this.logger.info(
        { did: this.did, callId: this.callId, caller: this.callerNumber },
        '🎯 INVITE RECEIVED - Processing call'
      );

      // ========================================================
      // STEP 2: LOAD SIP CONFIGURATION
      // ========================================================
      const sipConfig = this.srf.locals.sipConfig;
      if (!sipConfig) {
        this.logger.error('SIP Config not available');
        return this._sendErrorResponse(503, 'Service Unavailable');
      }

      const {
        livekitSipDomain,
        publicIp,
        livekitInboundTrunkId,
        publicSipPort,
        sipTransport
      } = sipConfig;

      this.logger.info(
        { livekitSipDomain, publicIp, trunkId: livekitInboundTrunkId },
        '✅ SIP config loaded'
      );

      // ========================================================
      // STEP 3: GET DESTINATION URI (with fallback)
      // ========================================================
      this.destinationUri = `sip:${this.did}@${livekitSipDomain}`;

      try {
        const backendUrl = process.env.BACKEND_URL || 'http://backend:3000';
        const destination = await getDestinationUri(backendUrl, this.did, this.logger);
        this.destinationUri = destination.destinationUri;
        this.logger.info({ destinationUri: this.destinationUri }, '✅ Destination URI from API');
      } catch (err) {
        this.logger.warn(
          { error: err.message, fallback: this.destinationUri },
          '⚠️  Using fallback destination URI'
        );
      }

      // ========================================================
      // STEP 4: RTPENGINE OFFER (WavOIP SDP → RtpEngine)
      // ========================================================
      // Extract SDP from INVITE body
      const incomingSdp = this.req.raw || this.req.body;
      this.logger.info({ sdpLength: incomingSdp?.length || 0 }, '📝 Sending SDP to RtpEngine');

      if (!incomingSdp) {
        this.logger.error('No SDP body found in INVITE');
        return this._sendErrorResponse(400, 'Missing SDP');
      }

      const fromHeader = this.req.getParsedHeader('From');
      const fromTag = fromHeader.params.tag;

      const offerPayload = {
        'sdp': incomingSdp,
        'call-id': this.callId,
        'from-tag': fromTag,
        'direction': ['public', 'public'],
        'ICE': 'remove',
        'record call': 'no'
      };

      const offerResponse = await rtpOffer(offerPayload);

      if (!offerResponse || offerResponse.result !== 'ok') {
        throw new Error(
          `RtpEngine Offer failed: ${offerResponse?.error || 'unknown error'}`
        );
      }

      // Validate that RtpEngine returned valid SDP
      if (!offerResponse.sdp || offerResponse.sdp.length === 0) {
        this.logger.error(
          { offerResponse: JSON.stringify(offerResponse).substring(0, 500) },
          '🚨 RtpEngine returned EMPTY SDP - This is the root cause!'
        );
        return this._sendErrorResponse(500, 'RtpEngine: Empty SDP');
      }

      this.logger.info(
        { sdpLength: offerResponse.sdp?.length || 0, sdpPreview: offerResponse.sdp?.substring(0, 100) },
        '✅ RtpEngine Offer successful'
      );

      // ========================================================
      // STEP 5: B2BUA TO LIVEKIT (with Answer interception)
      // ========================================================
      this.logger.info(
        { destinationUri: this.destinationUri, trunkId: livekitInboundTrunkId },
        '📤 Initiating B2BUA to LiveKit'
      );

      const { uas, uac } = await this.srf.createB2BUA(this.req, this.res, this.destinationUri, {
        headers: {
          'X-LiveKit-Trunk-Id': livekitInboundTrunkId,
          'Contact': `<sip:${this.callerNumber}@${publicIp}:${publicSipPort || 5060};transport=${sipTransport || 'udp'}>`
        },
        localSdpB: offerResponse.sdp,

        // Intercept LiveKit answer and send to RtpEngine
        localSdpA: async (sdpFromLiveKit, res) => {
          this.logger.info(
            { sdpLength: sdpFromLiveKit?.length || 0, statusCode: res.statusCode },
            '✅ Received SDP from LiveKit'
          );

          const toTag = res.getParsedHeader('To').params.tag;

          const answerPayload = {
            'sdp': sdpFromLiveKit,
            'call-id': this.callId,
            'from-tag': fromTag,
            'to-tag': toTag,
            'direction': ['public', 'public'],
            'ICE': 'remove',
            'record call': 'no'
          };

          const answerResponse = await rtpAnswer(answerPayload);

          if (!answerResponse || answerResponse.result !== 'ok') {
            throw new Error(
              `RtpEngine Answer failed: ${answerResponse?.error || 'unknown error'}`
            );
          }

          this.logger.info(
            { sdpLength: answerResponse.sdp?.length || 0 },
            '✅ RtpEngine Answer successful'
          );

          return answerResponse.sdp;
        },

        passHeaders: ['X-LiveKit-Trunk-Id', 'X-Twilio-CallSid']
      });

      this.logger.info(
        { callId: this.callId, did: this.did },
        '✅ Call established successfully'
      );

      // ========================================================
      // STEP 6: CLEANUP ON DESTROY
      // ========================================================
      const cleanup = async () => {
        this.logger.info('🧹 Cleaning up RtpEngine');
        try {
          await rtpDelete(this.callId);
        } catch (err) {
          this.logger.warn({ error: err.message }, '⚠️  RtpEngine cleanup failed');
        }
        try { uas.destroy(); } catch (e) {}
        try { uac.destroy(); } catch (e) {}
      };

      uas.on('destroy', cleanup);
      uac.on('destroy', cleanup);

    } catch (err) {
      this._handleError(err);
    }
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================
  _extractCallInfo() {
    this.did = parseUri(this.req.uri).user;
    const fromHeader = this.req.getParsedHeader('From');
    this.callerNumber = fromHeader && fromHeader.uri
      ? parseUri(fromHeader.uri).user
      : 'anonymous';
  }

  _sendErrorResponse(statusCode, reason) {
    if (this.res.finalResponseSent) {
      this.logger.warn('Response already sent, skipping error response');
      return;
    }
    try {
      this.res.send(statusCode, reason);
    } catch (err) {
      this.logger.error({ error: err.message }, 'Failed to send error response');
    }
  }

  async _handleError(err) {
    this.logger.error({
      errorMessage: err.message,
      errorName: err.name,
      errorStack: err.stack?.substring(0, 300),
      callId: this.callId,
      did: this.did,
      destinationUri: this.destinationUri
    }, '🚨 Call processing failed');

    // Cleanup RtpEngine
    try {
      await rtpDelete(this.callId);
    } catch (cleanupErr) {
      this.logger.warn({ error: cleanupErr.message }, '⚠️  RtpEngine cleanup failed');
    }

    // Send error response
    this._sendErrorResponse(500, 'Call Failed');
  }
}

module.exports = CallSession;
