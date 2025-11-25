const Emitter = require('events');
const { parseUri } = require('drachtio-srf');
const debug = require('debug')('drachtio:vendor-drachtio');
const RtpEngine = require('rtpengine-client').Client;

const rtpengine = new RtpEngine();

// Wrappers Promise para o RtpEngine
const rtpOffer = (port, payload) => {
  return new Promise((resolve, reject) => {
    rtpengine.offer(port, '127.0.0.1', payload, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
};

const rtpAnswer = (port, payload) => {
  return new Promise((resolve, reject) => {
    rtpengine.answer(port, '127.0.0.1', payload, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
};

const rtpDelete = (port, callId) => {
  return new Promise((resolve, reject) => {
    rtpengine.delete(port, '127.0.0.1', { 'call-id': callId }, (err, res) => {
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

    this.logger.info({ did, callId: this.callId }, '📞 Chamada recebida. Iniciando RtpEngine...');

    const livekitDomain = 'viu6oyhpr3m.sip.livekit.cloud';
    const targetUri = `sip:${did}@${livekitDomain}`;
    const myPublicIp = process.env.PUBLIC_IP;

    try {
      // 1. PROCESSA O OFFER (SDP da Wavoip -> RtpEngine)
      const offerResponse = await rtpOffer(22222, {
        'sdp': this.req.body,
        'call-id': this.callId,
        'from-tag': fromTag,
        'direction': ['public', 'public'],
        'ICE': 'remove',
        'record call': 'no'
      });

      if (!offerResponse || offerResponse.result !== 'ok') {
        throw new Error('RtpEngine Offer Failed: ' + JSON.stringify(offerResponse));
      }

      const sdpForLiveKit = offerResponse.sdp;
      this.logger.info('✅ RtpEngine Offer OK');

      // 2. B2BUA COM PROCESSAMENTO DE ANSWER
      const { uas, uac } = await this.srf.createB2BUA(this.req, this.res, targetUri, {
        headers: {
          'X-LiveKit-Trunk-Id': process.env.LIVEKIT_TRUNK_ID || 'ST_juWedU6TZJqf',
          'Contact': `<sip:${callerNumber}@${myPublicIp}:5060;transport=udp>`
        },
        localSdpB: sdpForLiveKit, // Envia SDP do RtpEngine para LiveKit
        
        // --- AQUI ESTÁ A CORREÇÃO: Intercepta a resposta do LiveKit ---
        localSdpA: async (sdpFromLiveKit, res) => {
          this.logger.info('Recebido SDP do LiveKit. Processando Answer no RtpEngine...');
          const toTag = res.getParsedHeader('To').params.tag;
          
          const answerResponse = await rtpAnswer(22222, {
            'sdp': sdpFromLiveKit,
            'call-id': this.callId,
            'from-tag': fromTag,
            'to-tag': toTag,
            'direction': ['public', 'public'],
            'ICE': 'remove',
            'record call': 'no'
          });

          if (answerResponse.result !== 'ok') {
            throw new Error('RtpEngine Answer Failed');
          }
          
          return answerResponse.sdp; // Retorna o SDP do RtpEngine para a Wavoip
        },
        // -------------------------------------------------------------
        
        passHeaders: ['X-LiveKit-Trunk-Id', 'X-Twilio-CallSid']
      });

      this.logger.info('✅ Chamada estabelecida bidirecionalmente!');

      // Limpeza
      const cleanup = () => {
        this.logger.info('Limpando RtpEngine...');
        rtpDelete(22222, this.callId).catch(() => {});
        try { uas.destroy(); } catch(e){}
        try { uac.destroy(); } catch(e){}
      };

      uas.on('destroy', cleanup);
      uac.on('destroy', cleanup);

    } catch (err) {
      this.logger.error({ err }, '🚨 Erro na sessão SIP');
      rtpDelete(22222, this.callId).catch(() => {});
      if (!this.res.finalResponseSent) this.res.send(500);
    }
  }
}

module.exports = CallSession;