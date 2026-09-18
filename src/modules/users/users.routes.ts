import { FastifyInstance } from "fastify";
import {
  createAdmin,
  adminLogin,
  forgotPasswordSendOtp,
  forgotPasswordVerifyOtp,
  forgotPasswordReset,
  forgotPasswordRecentOtp,
  changePassword,
  checkAuth,
} from "./users.controllers";
import { verifyUser } from "../../middleware/auth.middleware";
import { upload } from "../../config/storage.config";

export default async function usersRoutes(fastify: FastifyInstance) {
  /*
   * create admin
   * {{_baseUrl}}/api/users/create-admin
   */
  fastify.post(
    "/create-admin",
    {
      preHandler: [upload.single("image")],
    },
    createAdmin,
  );

  /*
   * admin login
   * {{_baseUrl}}/api/users/admin-login
   */
  fastify.post("/admin-login", adminLogin);

  //forgot password
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

  /*
   * change password
   * {{_baseUrl}}/api/users/change-password
   */
  fastify.post(
    "/change-password",
    { preHandler: [verifyUser("admin")] },
    changePassword,
  );

  /*
   * check auth
   * {{_baseUrl}}/api/users/check-auth
   */
  fastify.get(
    "/check-auth",
    { preHandler: [verifyUser("admin")] },
    checkAuth,
  );
}



// vps

// 583GptO8K2v
// +880 1908880294
// Indianmasala.contact@gmail.com
//pass vJrpE9aNq3Xf
// 15398678
//Your customer ID: 15398678
