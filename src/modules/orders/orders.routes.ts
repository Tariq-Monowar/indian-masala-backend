import { FastifyInstance } from "fastify";
import {
  createOrder,
  getAllOrders,
  getSingleOrder,
  getOrderStatus,
  updateOrderStatus,
  deleteOrderBulk,
} from "./orders.controllers";
import { verifyUser } from "../../middleware/auth.middleware";

export default async function ordersRoutes(fastify: FastifyInstance) {
  /*
   * create order
   * {{_baseUrl}}/api/orders/create
   */
  fastify.post("/create", createOrder);

  /*
   * get all orders
   * {{_baseUrl}}/api/orders/get
   */
  fastify.get(
    "/get",
    {
      preHandler: [verifyUser("admin", "customer")],
    },
    getAllOrders,
  );

  /*
   * get single order
   * {{_baseUrl}}/api/orders/single
   */
  fastify.get("/single", getSingleOrder);

  /*
   * get my order
   * {{_baseUrl}}/api/orders/my
   */
  fastify.get(
    "/my",
    {
      preHandler: [verifyUser("customer")],
    },
    getAllOrders,
  );

  /*
   * get order status
   * {{_baseUrl}}/api/orders/status
   */
  fastify.get("/status", getOrderStatus);

  /*
   * update order status
   * {{_baseUrl}}/api/orders/update
   */
  fastify.patch(
    "/update",
    {
      preHandler: [verifyUser("admin")],
    },
    updateOrderStatus,
  );

  /*
   * delete order bulk
   * {{_baseUrl}}/api/orders/bulk
   */
  fastify.delete(
    "/bulk",
    {
      preHandler: [verifyUser("admin")],
    },
    deleteOrderBulk,
  );
}
