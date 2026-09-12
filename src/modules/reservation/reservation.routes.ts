import { FastifyInstance } from "fastify";
import {
  createReservation,
  getAllReservation,
  getSingleReservation,
  updateReservationStatus,
  deleteReservationBulk,
} from "./reservation.controllers";
import { verifyUser } from "../../middleware/auth.middleware";

export default async function reservationRoutes(fastify: FastifyInstance) {
  /*
   * create reservation
   * {{_baseUrl}}/api/reservation/create
  */
  fastify.post("/create", createReservation);

  /*
   * get all reservation
   * {{_baseUrl}}/api/reservation/get
  */
  fastify.get(
    "/get",
    {
      preHandler: [verifyUser("admin")],
    },
    getAllReservation,
  );

  /*
   * get single reservation
   * {{_baseUrl}}/api/reservation/get/:id
  */
  fastify.get(
    "/get/:id",
    {
      preHandler: [verifyUser("admin")],
    },
    getSingleReservation,
  );

  /*
   * update reservation status
   * {{_baseUrl}}/api/reservation/update
  */
  fastify.patch(
    "/update",
    {
      preHandler: [verifyUser("admin")],
    },
    updateReservationStatus,
  );

  /*
   * delete reservation bulk
   * {{_baseUrl}}/api/reservation/bulk
  */
  fastify.delete(
    "/bulk",
    {
      preHandler: [verifyUser("admin")],
    },
    deleteReservationBulk,
  );
}
