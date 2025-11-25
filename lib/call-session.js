const Emitter = require('events');
const { parseUri } = require('drachtio-srf');
const debug = require('debug')('drachtio:vendor-drachtio');
const RtpEngine = require('rtpengine-client').Client;

const rtpengine = new RtpEngine();

// --- CORREÇÃO 1: Adicionado o host '127.0.0.1' nos wrappers ---

const rtpOffer = (port, payload) => {
  return new Promise((resolve, reject) => {
    // Assinatura correta: port, host, payload, callback
    rtpengine.offer(port, '127.0.0.1', payload, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    })
  })
}

const rtpDelete = (port, callId) => {
  return new Promise((resolve, reject) => {
    // Assinatura correta: port, host, payload, callback
    rtpengine.delete(port, '127.0.0.1', { 'call-id': callId }, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    })
  })
}
// -------------------------------------------------------------

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
    const uri = parseUri(this.req.uri);
    const did = uri.user;
    
    const fromHeader = this.req.getParsedHeader('From');
    const callerNumber = fromHeader && fromHeader.uri ? parseUri(fromHeader.uri).user : 'anonymous';

    debug({ uri, sdp: this.req.body }, 'incoming call received');
    this.logger.info({ did, callId: this.callId }, 'INVITE recebido, iniciando negociação...');

    let livekitDomain = 'viu6oyhpr3m.sip.livekit.cloud';
    const targetUri = `sip:${did}@${livekitDomain}`;
    
    this.logger.info({ targetUri }, 'Destino definido');

    const myPublicIp = process.env.PUBLIC_IP;

    try {
      this.logger.info('Solicitando alocação no RtpEngine...');

      // CORREÇÃO 2: Garantir que 'from' está em minúsculo para pegar a tag
      const fromTag = this.req.getParsedHeader('from').params.tag;

      const response = await rtpOffer(22222, {
        'sdp': this.req.body,
        'call-id': this.callId,
        'from-tag': fromTag,
        'direction': ['public', 'public'], 
        'ICE': 'remove',
        'record call': 'no',
      });

      if (!response || response.result !== 'ok') {
        this.logger.error({ response }, 'Falha na resposta do RtpEngine');
        throw new Error('RtpEngine failure');
      }

      const sdpProxy = response.sdp;
      this.logger.info('✅ RtpEngine alocado com sucesso. SDP Proxy gerado.');

      const { uas, uac } = await this.srf.createB2BUA(this.req, this.res, targetUri, {
        headers: {
          'X-LiveKit-Trunk-Id': process.env.LIVEKIT_TRUNK_ID || 'ST_juWedU6TZJqf',
          'Contact': `<sip:${callerNumber}@${myPublicIp}:5060;transport=udp>`
        },
        localSdpB: sdpProxy, // Envia o SDP do RtpEngine para o LiveKit
        passHeaders: [
          'X-LiveKit-Trunk-Id',
          'From',
          'To',
          'P-Asserted-Identity',
          'X-Twilio-CallSid',
          'X-Twilio-AccountSid',
        ]
      });

      this.logger.info({ did, callId: this.callId }, 'Chamada conectada! (Sinalização OK)');

      const cleanup = () => {
        this.logger.info('Limpando recursos do RtpEngine...');
        rtpDelete(22222, this.callId).catch((e) => this.logger.error(e));
        uas.destroy();
        uac.destroy();
      }

      // Handle hangups
      uas.on('destroy', cleanup);
      uac.on('destroy', cleanup);

    } catch (err) {
      this.logger.error({ err }, '🚨 Erro fatal na sessão');
      if (!this.res.finalResponseSent) this.res.send(500);
      rtpDelete(22222, this.callId).catch(() => {});
    }
  }
}

module.exports = CallSession;