import { FastifyInstance } from "fastify";
import {
  createAdmin,
  adminLogin,
  forgotPasswordSendOtp,
  forgotPasswordVerifyOtp,
  forgotPasswordReset,
  forgotPasswordRecentOtp,
} from "./users.controllers";

export default async function usersRoutes(fastify: FastifyInstance) {
  /*
   * create admin
   * {{_baseUrl}}/api/users/create-admin
  */
  fastify.post("/create-admin", createAdmin);

  /*
   * admin login
   * {{_baseUrl}}/api/users/admin-login
  */
  fastify.post("/admin-login", adminLogin);

  /*
   * forgotpassword sendotp
   * {{_baseUrl}}/api/users/forgotpassword/sendotp
  */
  fastify.post("/forgotpassword/sendotp", forgotPasswordSendOtp);

  /*
   * forgotpassword verifyotp
   * {{_baseUrl}}/api/users/forgotpassword/verifyotp
  */
  fastify.post("/forgotpassword/verifyotp", forgotPasswordVerifyOtp);

  /*
   * forgotpassword reset
   * {{_baseUrl}}/api/users/forgotpassword/reset
  */
  fastify.post("/forgotpassword/reset", forgotPasswordReset);

  /*
   * forgotpassword recentotp
   * {{_baseUrl}}/api/users/forgotpassword/recentotp
  */
  fastify.post("/forgotpassword/recentotp", forgotPasswordRecentOtp);
}
