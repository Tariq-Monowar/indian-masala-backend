import fp from "fastify-plugin";
import { db } from "../../prisma/db";

export default fp(async (fastify) => {
  fastify.decorate("db", db);
  fastify.log.info("Database ready");

  fastify.addHook("onClose", async () => {
    await db.close();
    fastify.log.info("Database disconnected");
  });
});
