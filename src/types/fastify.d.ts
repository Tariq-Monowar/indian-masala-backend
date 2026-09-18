import type { FastifyReply, FastifyRequest } from "fastify";
import type Redis from "ioredis";
import type { Server } from "socket.io";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
    io: Server;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      id: string;
      email: string;
      role: string;
    };
    user: {
      id: string;
      email: string;
      role: string;
    };
  }
}

declare module "socket.io" {
  interface SocketData {
    user: {
      id: string;
      email: string;
      role: string;
    };
  }
}
