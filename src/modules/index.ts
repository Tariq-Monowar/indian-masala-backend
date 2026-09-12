import { FastifyInstance } from "fastify";
import users from "./users/users.routes";

export default async function routes(fastify: FastifyInstance) {
  fastify.register(users, { prefix: "/users" });
}
