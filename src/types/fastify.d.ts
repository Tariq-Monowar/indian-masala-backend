import type { FastifyReply, FastifyRequest } from "fastify";
import type Redis from "ioredis";
import type { Server } from "socket.io";
import type { UploadImageSize } from "../utils/compress-upload-image";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
    io: Server;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyContextConfig {
    /** Crop uploaded images on this route to an exact size (null = default compression). */
    uploadImageSize?: (request: FastifyRequest) => UploadImageSize | null;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      id: string;
      email: string;
      phone?: string;
      name?: string;
      role: string;
    };
    user: {
      id: string;
      email: string;
      phone?: string;
      name?: string;
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
