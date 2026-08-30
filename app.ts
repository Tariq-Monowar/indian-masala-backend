/// <reference path="./src/types/fastify.d.ts" />
import path from "path";
import Fastify, { FastifyError } from "fastify";
import AutoLoad from "@fastify/autoload";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { registerMultipart, uploadsDir } from "./src/config/storage.config";

const app = Fastify({ logger: true });

export const frontendOrigin = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://localhost:5178",
  "http://localhost:5179",
  "http://localhost:5180",
];

app.register(cors, {
  origin: frontendOrigin,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

registerMultipart(app);

app.register(AutoLoad, {
  dir: path.join(import.meta.dirname, "src/plugins"),
});

app.register(AutoLoad, {
  dir: path.join(import.meta.dirname, "src/modules"),
  options: { prefix: "/api" },
});

app.register(fastifyStatic, {
  root: uploadsDir,
  prefix: "/uploads/",
});

app.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    statusCode: 404,
    message: "Route not found",
  });
});

app.setErrorHandler((error: FastifyError, request, reply) => {
  request.log.error(error);

  const statusCode = error.statusCode ?? 500;

  if (statusCode >= 500) {
    return reply.status(500).send({
      statusCode: 500,
      message: "Internal Server Error",
    });
  }

  return reply.status(statusCode).send({
    statusCode,
    message: error.message,
  });
});

export default app;
