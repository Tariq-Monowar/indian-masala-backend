import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
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
      files: 10,
    },
    attachFieldsToBody: "keyValues",
    async onFile(part) {
      if (!part.filename) {
        part.file.resume();
        return;
      }

      const filename = `${Date.now()}-${part.filename}`;
      await pipeline(part.file, fs.createWriteStream(path.join(uploads, filename)));
      Object.assign(part, { value: filename });
    },
  });
}

export const FileService = {
  removeFile(file) {
    if (!file) return;
    const filepath = file.path || path.join(uploads, file);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  },

  removeFiles(files) {
    if (!files) return;
    for (const file of files) {
      FileService.removeFile(file);
    }
  },
};

export const upload = {
  single(fieldName) {
    return async (request) => {
      const value = request.body?.[fieldName];
      request.file = value
        ? { filename: value, path: path.join(uploads, value) }
        : undefined;
      if (request.body) delete request.body[fieldName];
    };
  },

  array(fieldName, maxCount) {
    return async (request) => {
      const value = request.body?.[fieldName];
      const list = value ? [].concat(value) : [];
      request.files = list.slice(0, maxCount).map((filename) => ({
        filename,
        path: path.join(uploads, filename),
      }));
      if (request.body) delete request.body[fieldName];
    };
  },
};
