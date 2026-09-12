import path from "path";
import fs from "fs";
import multipart from "@fastify/multipart";
import { FastifyInstance } from "fastify";

export const uploads = path.join(import.meta.dirname, "../../uploads");

if (!fs.existsSync(uploads)) {
  fs.mkdirSync(uploads, { recursive: true });
}

export function registerMultipart(app: FastifyInstance) {
  app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 5,
    },
  });
}
