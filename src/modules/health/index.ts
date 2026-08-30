import { FastifyInstance } from "fastify";

export default async function healthModule(app: FastifyInstance) {
  app.get("/", async () => {
    return { ok: true };
  });
}
