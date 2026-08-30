import fp from "fastify-plugin";
import Redis from "ioredis";

export default fp(async (fastify) => {
  const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: 1,
  });

  redis.on("connect", () => {
    fastify.log.info("Redis connected");
  });

  redis.on("error", (error) => {
    fastify.log.error(`Redis error: ${error.message}`);
  });

  fastify.decorate("redis", redis);

  fastify.addHook("onClose", async () => {
    await redis.quit();
    fastify.log.info("Redis disconnected");
  });
});
