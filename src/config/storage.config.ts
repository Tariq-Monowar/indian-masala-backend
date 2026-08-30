import path from "path";
import fs from "fs";
import multipart from "@fastify/multipart";
import { FastifyInstance } from "fastify";

export const uploadsDir = path.join(import.meta.dirname, "../../uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export function registerMultipart(app: FastifyInstance) {
  app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 5,
    },
  });
}
