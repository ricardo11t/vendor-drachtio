const test = require('tape');
const { sippUac } = require('./sipp')('test_drachtio');
const clearModule = require('clear-module');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

function connect(connectable) {
  return new Promise((resolve, reject) => {
    connectable.on('connect', () => {
      return resolve();
    });
  });
}

test('sip tests', async(t) => {
  clearModule.all();
  const {srf, disconnect} = require('../app');

  t.teardown(() => {
    disconnect();
  });

  try {
    await connect(srf);
    await sippUac('uac.xml', '172.32.0.10');
    t.pass('invite test passes');
    await sippUac('uac-register-auth-success.xml', '172.32.0.10', 'good_user.csv');
    t.pass('register test passes');
    await sippUac('uac-subscribe-expect-480.xml', '172.32.0.10');
    t.pass('subscribe test passes');
    await sippUac('uac-publish-expect-480.xml', '172.32.0.10');
    t.pass('publish test passes');
    await sippUac('uac-message-expect-480.xml', '172.32.0.10');
    t.pass('message test passes');
    await sippUac('uac-options-expect-200.xml', '172.32.0.10');
    t.pass('options test passes');
    await sippUac('uac-info-expect-480.xml', '172.32.0.10');
    t.pass('info test passes');
    t.end();
  } catch (err) {
    console.log(`error received: ${err}`);
    t.end(err);
  }
});
