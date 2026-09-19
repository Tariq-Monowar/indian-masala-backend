import { FastifyInstance } from "fastify";
import {
  createOrder,
  verifyOrderOtp,
  getAllOrders,
  getSingleOrder,
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
   * verify order otp
   * {{_baseUrl}}/api/orders/verify-otp
  */
  fastify.post("/verify-otp", verifyOrderOtp);

  /*
   * get all orders
   * {{_baseUrl}}/api/orders/get
  */
  fastify.get(
    "/get",
    {
      preHandler: [verifyUser("admin")],
    },
    getAllOrders,
  );

  /*
   * get single order
   * {{_baseUrl}}/api/orders/get/:id
  */
  fastify.get(
    "/get/:id",
    {
      preHandler: [verifyUser("admin")],
    },
    getSingleOrder,
  );

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
