import { FastifyInstance } from "fastify";
import { createAdmin } from "./users.controllers";

export default async function usersRoutes(fastify: FastifyInstance) {
  /*
   * create admin
   * {{_baseUrl}}/api/users/create-admin
  */
  fastify.post("/create-admin", createAdmin);
}
