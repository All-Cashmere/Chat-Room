var redis = require('redis');
var env = require('node-env-file');
env('.env');

var pub = redis.createClient(process.env.REDIS_URL);
var sub = redis.createClient(process.env.REDIS_URL);

var persister = redis.createClient(process.env.REDIS_URL);

exports.pub = pub;
exports.sub = sub;
exports.persister = persister;