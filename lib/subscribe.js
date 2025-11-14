const debug = require('debug')('drachtio:vendor-drachtio');

module.exports = ({logger}) => {

  return (req, res) => {
    /* TODO: build this out with your logic */
    debug(req.uri, 'got incoming SUBSCRIBE');
    res.send(480, 'Under Construction!', {
      headers: {
        'User-agent': 'vendor-drachtio'
      }
    });
  };
};
