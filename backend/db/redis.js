const redis = require('redis');
require('dotenv').config();

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

// Connect to Redis immediately
(async () => {
  await redisClient.connect();
  console.log('Connected to Redis');
})();

module.exports = redisClient;
