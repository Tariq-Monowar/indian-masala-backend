import { FastifyInstance } from "fastify";
import users from "./users/users.routes";
import menu from "./menu/menu.routes";
import reservation from "./reservation/reservation.routes";
import catering from "./catering/catering.routes";
import contect_us from "./contect_us/contect_us.routes";

export default async function routes(fastify: FastifyInstance) {
  fastify.register(users, { prefix: "/users" });
  fastify.register(menu, { prefix: "/menu" });
  fastify.register(reservation, { prefix: "/reservation" });
  fastify.register(catering, { prefix: "/catering" });
  fastify.register(contect_us, { prefix: "/contect_us" });
}
