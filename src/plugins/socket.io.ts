import fp from "fastify-plugin";
import { Server } from "socket.io";

export default fp(async (fastify) => {
  const io = new Server(fastify.server, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    fastify.log.info(`Socket connected: ${socket.id}`);

    socket.on("join", ({ id, role }) => {
      if (!id || !role) return;

      // personal room → message one user
      socket.join(id);
      // role room → message all admin / customer / etc later
      socket.join(role);

      fastify.log.info(`${role} joined: ${id}`);
    });

    socket.on("disconnect", () => {
      fastify.log.info(`Socket disconnected: ${socket.id}`);
    });
  });

  fastify.decorate("io", io);

  fastify.addHook("onClose", async () => {
    io.close();
  });
});
