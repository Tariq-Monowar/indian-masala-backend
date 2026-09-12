import { FastifyInstance } from "fastify";
import {
  createCatering,
  getAllCatering,
  getSingleCatering,
  updateCateringStatus,
  deleteCateringBulk,
} from "./catering.controllers";
import { verifyUser } from "../../middleware/auth.middleware";

export default async function cateringRoutes(fastify: FastifyInstance) {
  /*
   * create catering
   * {{_baseUrl}}/api/catering/create
  */
  fastify.post("/create", createCatering);

  /*
   * get all catering
   * {{_baseUrl}}/api/catering/get
  */
  fastify.get(
    "/get",
    {
      preHandler: [verifyUser("admin")],
    },
    getAllCatering,
  );

  /*
   * get single catering
   * {{_baseUrl}}/api/catering/get/:id
  */
  fastify.get(
    "/get/:id",
    {
      preHandler: [verifyUser("admin")],
    },
    getSingleCatering,
  );

  /*
   * update catering status
   * {{_baseUrl}}/api/catering/update
  */
  fastify.patch(
    "/update",
    {
      preHandler: [verifyUser("admin")],
    },
    updateCateringStatus,
  );

  /*
   * delete catering bulk
   * {{_baseUrl}}/api/catering/bulk
  */
  fastify.delete(
    "/bulk",
    {
      preHandler: [verifyUser("admin")],
    },
    deleteCateringBulk,
  );
}
