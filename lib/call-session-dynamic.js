const Emitter = require('events');
const { parseUri } = require('drachtio-srf');
const debug = require('debug')('drachtio:vendor-drachtio');
const RtpEngine = require('rtpengine-client').Client;
const { getDestinationUri } = require('./sip-config');

// RTPEngine connection settings from environment
const RTPENGINE_HOST = process.env.RTPENGINE_HOST || '127.0.0.1';
const RTPENGINE_PORT = process.env.RTPENGINE_PORT || 22222;

// Lazy initialization of RTPEngine on first use
let rtpengine = null;

const getRtpEngine = () => {
  if (!rtpengine) {
    rtpengine = new RtpEngine({
      host: RTPENGINE_HOST,
      port: RTPENGINE_PORT
    });
  }
  return rtpengine;
};

// Wrappers Promise para o RtpEngine
const rtpOffer = (payload) => {
  return new Promise((resolve, reject) => {
    const engine = getRtpEngine();
    engine.offer(RTPENGINE_PORT, payload, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
};

const rtpAnswer = (payload) => {
  return new Promise((resolve, reject) => {
    const engine = getRtpEngine();
    engine.answer(RTPENGINE_PORT, payload, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
};

const rtpDelete = (callId) => {
  return new Promise((resolve, reject) => {
    const engine = getRtpEngine();
    engine.delete(RTPENGINE_PORT, { 'call-id': callId }, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
};

class CallSession extends Emitter {
  constructor(req, res) {
    super();
    this.req = req;
    this.res = res;
    this.srf = req.srf;
    this.logger = req.locals.logger;
    this.callId = req.get('Call-ID');
  }

  async connect() {
    const did = parseUri(this.req.uri).user;
    const fromHeader = this.req.getParsedHeader('From');
    const callerNumber = fromHeader && fromHeader.uri ? parseUri(fromHeader.uri).user : 'anonymous';
    const fromTag = fromHeader.params.tag;

    this.logger.info({ did, callId: this.callId, from: this.req.from, to: this.req.to, viaHost: this.req.via }, '📞 Chamada recebida');

    // ============================================================
    // FETCH CONFIGURATION DINAMICAMENTE
    // ============================================================
    const sipConfig = this.srf.locals.sipConfig;
    
    if (!sipConfig) {
      this.logger.error('SIP Config not available');
      if (!this.res.finalResponseSent) this.res.send(503, 'Service Unavailable');
      return;
    }

    // LOG ALL CONFIG KEYS RECEIVED
    this.logger.debug({ allKeys: Object.keys(sipConfig), fullConfig: sipConfig }, '📋 Full SIP Config from API');

    const livekitDomain = sipConfig.livekitSipDomain;
    const rtpEnginePort = sipConfig.rtpEnginePort || 22222;
    const myPublicIp = sipConfig.publicIp;
    const livekitTrunkId = sipConfig.livekitInboundTrunkId;

    // LOG EXTRACTED CONFIG VALUES
    this.logger.info(
      { 
        livekitDomain, 
        rtpEnginePort, 
        myPublicIp, 
        livekitTrunkId 
      }, 
      '🔑 Extracted configuration keys'
    );

    // Define destinationUri at function scope so it's available in catch block
    let destinationUri = `sip:${did}@${livekitDomain}`; // Default

    try {
      // ============================================================
      // LOOKUP DESTINATION DINAMICAMENTE (CALL API)
      // ============================================================
      const backendUrl = process.env.BACKEND_URL || 'http://backend:3000';

      try {
        const destination = await getDestinationUri(backendUrl, did, this.logger);
        destinationUri = destination.destinationUri;
        
        this.logger.info(
          { did, destinationUri, metadata: destination.metadata },
          '✅ Destination URI obtido da API'
        );
      } catch (err) {
        this.logger.warn(
          { err: err.message, did, usingDefault: destinationUri },
          '⚠️  Failed to get destination from API, using default'
        );
        // Continue com destino padrão já inicializado
      }

      // 1. PROCESSA O OFFER (SDP da Wavoip -> RtpEngine)
      this.logger.info({ sdpLength: this.req.body ? this.req.body.length : 0 }, '📝 Enviando SDP para RtpEngine...');
      
      const offerPayload = {
        'sdp': this.req.body,
        'call-id': this.callId,
        'from-tag': fromTag,
        'direction': ['public', 'public'],
        'ICE': 'remove',
        'record call': 'no'
      };
      
      this.logger.debug({ offerPayload: JSON.stringify(offerPayload).substring(0, 500) }, '🔍 Payload do RtpEngine Offer');
      
      const offerResponse = await rtpOffer(offerPayload);

      this.logger.debug({ offerResponse: JSON.stringify(offerResponse).substring(0, 500) }, '📊 Resposta bruta do RtpEngine');

      if (!offerResponse || offerResponse.result !== 'ok') {
        this.logger.error({ result: offerResponse?.result, error: offerResponse?.error }, '❌ RtpEngine Offer retornou resultado diferente de OK');
        throw new Error('RtpEngine Offer Failed: ' + JSON.stringify(offerResponse));
      }

      const sdpForLiveKit = offerResponse.sdp;
      this.logger.info({ sdpLength: sdpForLiveKit ? sdpForLiveKit.length : 0 }, '✅ RtpEngine Offer OK');

      // 2. B2BUA COM PROCESSAMENTO DE ANSWER
      this.logger.info(
        { 
          destinationUri,
          livekitDomain,
          trunkId: livekitTrunkId,
          publicIp: myPublicIp,
          publicSipPort: sipConfig.publicSipPort || 5060,
          sipTransport: sipConfig.sipTransport || 'udp'
        }, 
        '📤 B2BUA Request - Sending INVITE to LiveKit'
      );

      this.logger.debug({
        sdpForLiveKitLength: sdpForLiveKit ? sdpForLiveKit.length : 0,
        contactHeader: `<sip:${callerNumber}@${myPublicIp}:${sipConfig.publicSipPort || 5060};transport=${sipConfig.sipTransport || 'udp'}>`
      }, '📋 B2BUA Payload Details');

      this.logger.info(`🔄 Initiating B2BUA to: ${destinationUri}`);
      
      const { uas, uac } = await this.srf.createB2BUA(this.req, this.res, destinationUri, {
        headers: {
          'X-LiveKit-Trunk-Id': livekitTrunkId,
          'Contact': `<sip:${callerNumber}@${myPublicIp}:${sipConfig.publicSipPort || 5060};transport=${sipConfig.sipTransport || 'udp'}>`
        },
        localSdpB: sdpForLiveKit, // Envia SDP do RtpEngine para LiveKit
        
        // --- INTERCEPTA A RESPOSTA DO LIVEKIT ---
        localSdpA: async (sdpFromLiveKit, res) => {
          this.logger.info({ sdpLength: sdpFromLiveKit ? sdpFromLiveKit.length : 0, statusCode: res.statusCode }, '✅ Recebido SDP do LiveKit');
          this.logger.debug({ sdpFromLiveKit: sdpFromLiveKit?.substring(0, 300) }, '📝 SDP do LiveKit');
          const toTag = res.getParsedHeader('To').params.tag;
          this.logger.debug({ fromTag, toTag, callId: this.callId }, '🔖 Tags SIP para Answer');
          
          const answerPayload = {
            'sdp': sdpFromLiveKit,
            'call-id': this.callId,
            'from-tag': fromTag,
            'to-tag': toTag,
            'direction': ['public', 'public'],
            'ICE': 'remove',
            'record call': 'no'
          };
          
          this.logger.debug({ payload: JSON.stringify(answerPayload).substring(0, 500) }, '🔍 Payload do RtpEngine Answer');
          const answerResponse = await rtpAnswer(answerPayload);
          this.logger.debug({ response: JSON.stringify(answerResponse).substring(0, 500) }, '📊 Resposta do RtpEngine Answer');

          if (answerResponse.result !== 'ok') {
            this.logger.error({ result: answerResponse?.result, error: answerResponse?.error }, '❌ RtpEngine Answer falhou');
            throw new Error('RtpEngine Answer Failed: ' + JSON.stringify(answerResponse));
          }
          this.logger.info({ sdpLength: answerResponse.sdp?.length }, '✅ RtpEngine Answer OK');
          
          return answerResponse.sdp;
        },
        // -----------------------------------------------
        
        passHeaders: ['X-LiveKit-Trunk-Id', 'X-Twilio-CallSid']
      });

      this.logger.info({ callId: this.callId, did, destinationUri }, '✅ Chamada estabelecida bidirecionalmente!');

      // Limpeza
      const cleanup = () => {
        this.logger.info('Limpando RtpEngine...');
        rtpDelete(this.callId).catch(() => {});
        try { uas.destroy(); } catch(e){}
        try { uac.destroy(); } catch(e){}
      };

      uas.on('destroy', cleanup);
      uac.on('destroy', cleanup);

    } catch (err) {
      this.logger.error({ 
        errorMessage: err.message,
        errorName: err.name,
        errorStack: err.stack?.substring(0, 500),
        errorStatus: err.status,
        errorReason: err.reason,
        sipMessage: err.res?.msg,
        sipStatusCode: err.res?.statusCode,
        did,
        callId: this.callId,
        destinationUri,
        livekitDomain,
        trunkId: livekitTrunkId,
        responseAlreadySent: this.res.finalResponseSent,
        fromUri: this.req.from,
        toUri: this.req.to,
        viaHost: this.req.via
      }, '🚨 Erro na sessão SIP - detalhes completos');
      
      // Clean up RTP engine
      rtpDelete(this.callId).catch((cleanupErr) => {
        this.logger.warn({ err: cleanupErr.message }, '⚠️  Failed to cleanup RTP engine');
      });
      
      // Only send error response if response hasn't been sent already
      if (!this.res.finalResponseSent) {
        try {
          this.res.send(500, 'Call Failed');
        } catch (sendErr) {
          this.logger.error({ err: sendErr.message }, '❌ Failed to send error response');
        }
      } else {
        this.logger.warn('Response already sent, skipping error response');
      }
    }
  }
}

module.exports = CallSession;
