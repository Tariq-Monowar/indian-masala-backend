import path from "path";
import fs from "fs";
import { randomBytes } from "crypto";
import { pipeline } from "stream/promises";
import multipart from "@fastify/multipart";
import { FastifyInstance, FastifyRequest } from "fastify";
import { compressUploadToWebp } from "../utils/compress-upload-image";
import { sanitizeUploadFilename } from "../utils/upload-url";

export const uploads = path.join(import.meta.dirname, "../../uploads");

if (!fs.existsSync(uploads)) {
  fs.mkdirSync(uploads, { recursive: true });
}

function isRasterImage(mimetype: string | undefined) {
  const type = (mimetype || "").toLowerCase();
  return type.startsWith("image/") && type !== "image/svg+xml";
}

async function readFilePart(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function uploadError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

function storedFilename(originalName: string, extension: string) {
  const safe = sanitizeUploadFilename(originalName);
  const currentExt = path.extname(safe);
  const stem = (currentExt ? safe.slice(0, -currentExt.length) : safe).replace(/\.+$/, "");
  return `${Date.now()}-${randomBytes(3).toString("hex")}-${stem || "file"}${extension}`;
}

export function registerMultipart(app: FastifyInstance) {
  app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 10,
    },
    attachFieldsToBody: "keyValues",
    async onFile(this: FastifyRequest, part) {
      if (!part.filename) {
        part.file.resume();
        return;
      }

      const imageSize = this.routeOptions.config.uploadImageSize?.(this) ?? null;

      if (imageSize) {
        if (!isRasterImage(part.mimetype)) {
          part.file.resume();
          throw uploadError(415, "Only image files are allowed");
        }

        let webp: Buffer;
        try {
          webp = await compressUploadToWebp(await readFilePart(part.file), imageSize);
        } catch {
          throw uploadError(400, "Invalid or corrupted image file");
        }
        const filename = storedFilename(part.filename, ".webp");
        await fs.promises.writeFile(path.join(uploads, filename), webp);
        Object.assign(part, { value: filename });
        return;
      }

      if (!isRasterImage(part.mimetype)) {
        const safeName = sanitizeUploadFilename(part.filename);
        const filename = storedFilename(part.filename, path.extname(safeName));
        await pipeline(part.file, fs.createWriteStream(path.join(uploads, filename)));
        Object.assign(part, { value: filename });
        return;
      }

      const input = await readFilePart(part.file);
      const webp = await compressUploadToWebp(input);
      const filename = storedFilename(part.filename, ".webp");
      await fs.promises.writeFile(path.join(uploads, filename), webp);
      Object.assign(part, { value: filename });
    },
  });
}

export const FileService = {
  removeFile(file) {
    if (!file) return;
    let name = file.path || file;
    if (typeof name === "string") {
      if (
        name.startsWith("http://") ||
        name.startsWith("https://") ||
        name.includes("/uploads/")
      ) {
        const parts = name.replace(/\\/g, "/").split("/");
        name = decodeURIComponent(parts[parts.length - 1] || name);
      }
      name = path.join(uploads, name);
    }
    if (fs.existsSync(name)) fs.unlinkSync(name);
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
