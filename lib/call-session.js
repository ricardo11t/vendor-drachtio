const Emitter = require('events');
const { parseUri } = require('drachtio-srf');
const debug = require('debug')('drachtio:vendor-drachtio');

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

    try {
      const myPublicIp = process.env.PUBLIC_IP;
      const { uas, uac } = await this.srf.createB2BUA(this.req, this.res, targetUri, {
        headers: {
	  'X-LiveKit-Trunk-Id': process.env.LIVEKIT_TRUNK_ID || 'ST_hF9FKhKi4PfZ',
	  'Contact': `<sip:${callerNumber}@${myPublicIp}:5060;transport=udp>`
	},
	localSdpB: this.req.body,
	passHeaders: [
	  'X-LiveKit-Trunk-Id',
	  'From',
	  'To',
	  'P-Asserted-Identity',
	  'X-Twilio-CallSid',
	  'X-Twilio-AccountSid',
	]
      });	


      this.logger.info({ did, callId: this.callId }, 'Call successfully bridged to LiveKit');

      // Handle hangups
      uas.on('destroy', () => {
        this.logger.info({ did, callId: this.callId }, 'Caller hung up');
        uac.destroy();
      });

      uac.on('destroy', () => {
        this.logger.info({ did, callId: this.callId }, 'LiveKit hung up');
        uas.destroy();
      });

    } catch (err) {
      this.logger.error({ err, did, callId: this.callId }, 'Error bridging call to LiveKit');
      if (!this.res.finalResponseSent) {
        this.res.send(500, 'Internal Server Error');
      }
    }
  }
}

module.exports = CallSession;
