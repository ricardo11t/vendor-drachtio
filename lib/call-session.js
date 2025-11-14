const Emitter = require('events');
const {parseUri} = require('drachtio-srf');
const debug = require('debug')('drachtio:vendor-drachtio');

class CallSession extends Emitter {
  constructor(req, res) {
    super();
    this.req = req;
    this.res = res;
    this.srf = req.srf;
    this.logger = req.locals.logger;
    this.ms = this.srf.locals.ms;
  }

  async connect() {
    const uri = parseUri(this.req.uri);
    debug({uri, sdp: this.req.body}, 'incoming call received');
    this.logger.info({uri}, 'inbound call accepted for routing');

    try {
      const {endpoint, dialog} = await this.ms.connectCaller(this.req, this.res);
      this.ep = endpoint;
      this.uas = dialog;

      this.uas.on('destroy', () => {
        this.logger.info('call ended');
        this.ep.destroy();
      });
    } catch (err) {
      this.logger.info({err}, 'Error connecting to freeswitch');
    }
  }
}

module.exports = CallSession;
