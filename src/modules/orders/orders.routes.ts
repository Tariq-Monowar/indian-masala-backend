import { FastifyInstance } from "fastify";
import { createOrder, verifyOrderOtp } from "./orders.controllers";

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
}
