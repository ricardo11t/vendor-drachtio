const Srf = require('drachtio-srf');
const srf = new Srf();
const opts = Object.assign(
  {
    timestamp: () => {
      return `, "time": "${new Date().toISOString()}"`;
    },
  },
  { level: process.env.LOGLEVEL || 'info' },
);
const logger = require('pino')(opts);
const { initLocals, checkCache, challenge } =
  require('./lib/middleware')(logger);
const regParser = require('drachtio-mw-registration-parser');
const Registrar = require('@jambonz/mw-registrar');
const CallSession = require('./lib/call-session');
const {
  registerOutboundTrunks,
  startRegistrationRefresh,
} = require('./lib/outbound-registration');
srf.locals.registrar = new Registrar(logger, {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
});

srf.connect({
  host: process.env.DRACHTIO_HOST || '127.0.0.1',
  port: process.env.DRACHTIO_PORT || 9022,
  secret: process.env.DRACHTIO_SECRET || 'cymru',
});
srf.on('connect', async (err, hp) => {
  if (err) return logger.error({ err }, 'Error connecting to drachtio');
  logger.info(`connected to drachtio listening on ${hp}`);
  logger.info('Ready to receive SIP calls - routing to LiveKit');

  // Register all outbound trunks from backend
  try {
    await registerOutboundTrunks(srf, logger);
    startRegistrationRefresh(srf, logger);
  } catch (err) {
    logger.error({ err }, 'Error registering outbound trunks');
    // Non-fatal error - continue anyway
  }
});

srf.invite([initLocals], (req, res) => {
  const session = new CallSession(req, res);
  session.connect();
});
srf.use('register', [initLocals, regParser, checkCache, challenge]);
srf.register(require('./lib/register')({ logger }));
srf.subscribe(require('./lib/subscribe')({ logger }));
srf.publish(require('./lib/publish')({ logger }));
srf.message(require('./lib/message')({ logger }));
srf.options(require('./lib/options')({ logger }));
srf.info(require('./lib/info')({ logger }));

if ('test' === process.env.NODE_ENV) {
  const disconnect = () => {
    return new Promise((resolve) => {
      srf.disconnect();
      resolve();
    });
  };

  module.exports = { srf, logger, disconnect };
}
