import { FastifyInstance } from "fastify";
import users from "./users/users.routes";
import menu from "./menu/menu.routes";
import reservation from "./reservation/reservation.routes";

export default async function routes(fastify: FastifyInstance) {
  fastify.register(users, { prefix: "/users" });
  fastify.register(menu, { prefix: "/menu" });
  fastify.register(reservation, { prefix: "/reservation" });
}
