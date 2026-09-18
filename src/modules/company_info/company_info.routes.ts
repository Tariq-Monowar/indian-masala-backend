import { FastifyInstance } from "fastify";
import { getCompanyInfo, createCompanyInfo } from "./company_info.controllers";
import { verifyUser } from "../../middleware/auth.middleware";

export default async function companyInfoRoutes(fastify: FastifyInstance) {
  /*
   * get company_info
   * {{_baseUrl}}/api/company_info/get
  */
  fastify.get("/get", getCompanyInfo);

  /*
   * create company_info
   * {{_baseUrl}}/api/company_info/create
  */
  fastify.post(
    "/create",
    {
      preHandler: [verifyUser("admin")],
    },
    createCompanyInfo,
  );
}
