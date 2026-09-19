import { FastifyInstance } from "fastify";
import users from "./users/users.routes";
import menu from "./menu/menu.routes";
import reservation from "./reservation/reservation.routes";
import catering from "./catering/catering.routes";
import contect_us from "./contect_us/contect_us.routes";
import company_info from "./company_info/company_info.routes";
import orders from "./orders/orders.routes";
import dashboard from "./dashboard/dashboard.routes";
import notifications from "./notifications/notifications.routes";

export default async function routes(fastify: FastifyInstance) {
  fastify.register(users, { prefix: "/users" });
  fastify.register(menu, { prefix: "/menu" });
  fastify.register(reservation, { prefix: "/reservation" });
  fastify.register(catering, { prefix: "/catering" });
  fastify.register(contect_us, { prefix: "/contect_us" });
  fastify.register(company_info, { prefix: "/company_info" });
  fastify.register(orders, { prefix: "/orders" });
  fastify.register(dashboard, { prefix: "/dashboard" });
  fastify.register(notifications, { prefix: "/notifications" });
}
