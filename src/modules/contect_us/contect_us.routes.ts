import { FastifyInstance } from "fastify";
import {
  createContectUs,
  getAllContectUs,
  deleteContectUsBulk,
} from "./contect_us.controllers";
import { verifyUser } from "../../middleware/auth.middleware";

export default async function contectUsRoutes(fastify: FastifyInstance) {
  /*
   * create contect_us
   * {{_baseUrl}}/api/contect_us/create
  */
  fastify.post("/create", createContectUs);

  /*
   * get all contect_us
   * {{_baseUrl}}/api/contect_us/get
  */
  fastify.get(
    "/get",
    {
      preHandler: [verifyUser("admin")],
    },
    getAllContectUs,
  );

  /*
   * delete contect_us bulk
   * {{_baseUrl}}/api/contect_us/bulk
  */
  fastify.delete(
    "/bulk",
    {
      preHandler: [verifyUser("admin")],
    },
    deleteContectUsBulk,
  );
}
