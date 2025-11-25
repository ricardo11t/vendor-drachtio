const Emitter = require('events');
const { parseUri } = require('drachtio-srf');
const debug = require('debug')('drachtio:vendor-drachtio');
const RtpEngine = require('rtpengine-client').Client;

const rtpengine = new RtpEngine();

const rtpOffer = (port, payload) => {
  return new Promise((resolve, reject) => {
    rtpengine.offer(port, payload, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    })
  })
}

const rtpDelete = (port, callId) => {
  return new Promise((resolve, reject) => {
    rtpengine.delete(port, { call_id: callId }, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    })
  })
}

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
    // const myPublicIp = process.env.PUBLIC_IP;
    
    // let localSdp = this.req.body;

    //if (myPublicIp && localSdp) {
//	localSdp = localSdp.replace(/c=IN IP4 ([\d\.]+)/g, `c=IN IP4 ${myPublicIp}`);
//	this.logger.info('SPD modificado para usar IP Público no LiveKit');
  //  }
	 
    const fromHeader = this.req.getParsedHeader('From');
    const callerNumber = fromHeader && fromHeader.uri ? parseUri(fromHeader.uri).user : 'anonymous';

    debug({ uri, sdp: this.req.body }, 'incoming call received');
    this.logger.info({ did, callId: this.callId }, 'INVITE received, forwarding to LiveKit');

    let livekitDomain = 'viu6oyhpr3m.sip.livekit.cloud';
    const targetUri = `sip:${did}@${livekitDomain}`;
    
    this.logger.info({ targetUri }, 'Forwarding call to');

    const myPublicIp = process.env.PUBLIC_IP;
    try {
      this.logger.info('Solicitando alocação no RtpEngine...');

      const response = await rtpOffer(22222, {
        'sdp': this.req.body,
        'call-id': this.callId,
        'from-tag': this.req.getParsedHeader('From').params.tag,
        'direction': ['public', 'public'],
        'ICE': 'remove',
        'record call': 'no',
      });

      if (!response || response.result !== 'ok') {
        this.logger.error({ response }, 'Falha no RtpEngine');
        throw new Error('RtpEngine failure');
      }

      const sdpProxy = response.sdp;
      this.logger.info('Alocação no RtpEngine realizada com sucesso.');

      const { uas, uac } = await this.srf.createB2BUA(this.req, this.res, targetUri, {
        headers: {
	        'X-LiveKit-Trunk-Id': process.env.LIVEKIT_TRUNK_ID || 'ST_hF9FKhKi4PfZ',
	        'Contact': `<sip:${callerNumber}@${myPublicIp}:5060;transport=udp>`
	      },
	      localSdpB: sdpProxy,
	      passHeaders: [
          'X-LiveKit-Trunk-Id',
          'From',
          'To',
          'P-Asserted-Identity',
          'X-Twilio-CallSid',
          'X-Twilio-AccountSid',
        ]
      });

      const cleanup = () => {
        this.logger.info('Limpando recursos do RtpEngine...');
        rtpDelete(22222, { 'call-id': this.callId }).catch((e) => this.logger.error(e));
        uas.destroy();
        uac.destroy();
      }

      this.logger.info({ did, callId: this.callId }, 'Call successfully bridged to LiveKit');

      // Handle hangups
      uas.on('destroy', cleanup);

      uac.on('destroy', cleanup);

    } catch (err) {
      this.logger.error({ err }, '🚨 Erro fatal na sessão');
      if (!this.res.finalResponseSent) this.res.send(500);
      rtpDelete(22222, { 'call-id': this.callId }).catch(() => {});
    }
  }
}

module.exports = CallSession;
