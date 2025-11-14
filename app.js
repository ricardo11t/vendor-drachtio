const Srf = require('drachtio-srf');
const srf = new Srf();
const Mrf = require('drachtio-fsmrf');
const mrf = new Mrf(srf);
const opts = Object.assign({
  timestamp: () => {return `, "time": "${new Date().toISOString()}"`;}
}, {level: process.env.LOGLEVEL || 'info'});
const logger = require('pino')(opts);
const {initLocals, checkCache, challenge} = require('./lib/middleware')(logger);
const regParser = require('drachtio-mw-registration-parser');
const Registrar = require('@jambonz/mw-registrar');
srf.locals.registrar = new Registrar(logger, {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379
});
// Prevent unhandled 'error' from killing the process when drachtio is not available.
// This allows running the app in a dev environment without an active drachtio daemon.
srf.on('error', (err) => {
  logger.error({err}, 'drachtio connection error');
});
const CallSession = require('./lib/call-session');

srf.connect({
  host: process.env.DRACHTIO_HOST || '127.0.0.1',
  port: process.env.DRACHTIO_PORT || 9022,
  secret: process.env.DRACHTIO_SECRET || 'cymru'
});
srf.on('connect', async(err, hp) => {
  if (err) return logger.error({err}, 'Error connecting to drachtio');
  logger.info(`connected to drachtio listening on ${hp}`);
  try {
    const opts = {
      address: process.env.FREESWITCH_HOST || '127.0.0.1',
      port: process.env.FREESWITCH_PORT || 8021,
      secret: process.env.FREESWITCH_SECRET || 'ClueCon'
    };
    if ('test' === process.env.NODE_ENV) {
      Object.assign(opts, {
        advertisedAddress: 'docker-host',
        listenAddress: '0.0.0.0'
      });
    }
    srf.locals.ms = await mrf.connect(opts);
  } catch (err) {
    logger.error({err}, 'Error connecting to freeswitch');
  }
});

srf.invite([initLocals], (req, res) => {
  const session = new CallSession(req, res);
  session.connect();
});
srf.use('register', [initLocals, regParser, checkCache, challenge]);
srf.register(require('./lib/register')({logger}));
srf.subscribe(require('./lib/subscribe')({logger}));
srf.publish(require('./lib/publish')({logger}));
srf.message(require('./lib/message')({logger}));
srf.options(require('./lib/options')({logger}));
srf.info(require('./lib/info')({logger}));

if ('test' === process.env.NODE_ENV) {
  const disconnect = () => {
    return new Promise ((resolve) => {
      srf.disconnect();
      srf.locals.ms.disconnect();
      resolve();
    });
  };

  module.exports = {srf, logger, disconnect};
}
