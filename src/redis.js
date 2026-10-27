
const { createClient } = require("redis");

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379)
  }
});

client.on("error", (error) => {
  console.error("Redis error:", error.message);
});

async function connectRedis() {
  await client.connect();
  console.log("Connected to Redis");
}

module.exports = { client, connectRedis };

