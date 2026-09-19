import { FastifyInstance } from "fastify";
import {
  getDashboardStats,
  getOrdersThisWeek,
} from "./dashboard.controllers";
import { verifyUser } from "../../middleware/auth.middleware";

export default async function dashboardRoutes(fastify: FastifyInstance) {
  /*
   * get dashboard stats
   * {{_baseUrl}}/api/dashboard/get
  */
  fastify.get(
    "/get",
    {
      preHandler: [verifyUser("admin")],
    },
    getDashboardStats,
  );

  /*
   * get orders this week
   * {{_baseUrl}}/api/dashboard/orders-week
  */
  fastify.get(
    "/orders-week",
    {
      preHandler: [verifyUser("admin")],
    },
    getOrdersThisWeek,
  );
}
