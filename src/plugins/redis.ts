import fp from "fastify-plugin";
import Redis from "ioredis";

export default fp(async (fastify) => {
  const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy(times) {
      // Back off; keep trying in background without flooding logs every ms
      if (times > 20) return null;
      return Math.min(times * 500, 5000);
    },
  });

  let lastErrorLog = 0;
  redis.on("connect", () => {
    fastify.log.info("Redis connected");
  });

  redis.on("error", (error) => {
    const now = Date.now();
    if (now - lastErrorLog < 15_000) return;
    lastErrorLog = now;
    fastify.log.warn(`Redis unavailable (optional): ${error.message}`);
  });

  // Best-effort connect; app works without Redis
  redis.connect().catch(() => {});

  fastify.decorate("redis", redis);

  fastify.addHook("onClose", async () => {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
    fastify.log.info("Redis disconnected");
  });
});
