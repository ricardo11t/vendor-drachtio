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

    debug({ uri, sdp: this.req.body }, 'incoming call received');
    this.logger.info({ did, callId: this.callId }, 'INVITE received, forwarding to LiveKit');

    // Determine LiveKit SIP Domain
    let livekitDomain = 'sip.livekit.cloud';
    if (process.env.LIVEKIT_URL) {
      try {
        // Remove protocol (wss:// or https://) to get hostname
        const urlStr = process.env.LIVEKIT_URL.includes('://') 
          ? process.env.LIVEKIT_URL 
          : `https://${process.env.LIVEKIT_URL}`;
        const url = new URL(urlStr);
        livekitDomain = url.hostname;
      } catch (e) {
        this.logger.warn({ err: e }, 'Invalid LIVEKIT_URL, using default sip.livekit.cloud');
      }
    }

    // Construct Target URI
    // We preserve the original DID (User) so LiveKit can match it to a Dispatch Rule
    const targetUri = `sip:${did}@${livekitDomain}`;
    
    this.logger.info({ targetUri }, 'Forwarding call to');

    try {
      // Create B2BUA (Back-to-Back User Agent)
      // This connects the incoming call (req/res) to a new outgoing call (targetUri)
      const { uas, uac } = await this.srf.createB2BUA(this.req, this.res, targetUri, {
        headers: {
          // Add trunk ID header so LiveKit can identify the trunk
          // This is needed because Docker networking makes IP-based identification unreliable
          'X-LiveKit-Trunk-Id': process.env.LIVEKIT_TRUNK_ID || 'ST_hF9FKhKi4PfZ'
        },
        passHeaders: [
          'X-LiveKit-Trunk-Id', 
          'From', 
          'To', 
          'P-Asserted-Identity', 
          'X-Twilio-CallSid',
          'X-Twilio-AccountSid'
        ],
        localSdpB: this.req.body // Pass caller's SDP to LiveKit
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
