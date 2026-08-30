import { FastifyInstance } from "fastify";
import {
  createStaff,
  deleteStaff,
  getStaff,
  listStaff,
  updateStaff,
} from "./service";

export default async function staffModule(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (request) => {
    return listStaff(request.user.restaurantId);
  });

  app.get("/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const staff = await getStaff(request.user.restaurantId, params.id);

    if (!staff) {
      return reply.code(404).send({
        statusCode: 404,
        message: "Staff not found",
      });
    }

    return staff;
  });

  app.post(
    "/",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "role"],
          properties: {
            name: { type: "string", minLength: 2 },
            phone: { type: "string" },
            role: { type: "string", minLength: 2 },
          },
        },
      },
    },
    async (request) => {
      const body = request.body as {
        name: string;
        phone?: string;
        role: string;
      };

      return createStaff(request.user.restaurantId, body);
    }
  );

  app.patch(
    "/:id",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 2 },
            phone: { type: "string" },
            role: { type: "string", minLength: 2 },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as {
        name?: string;
        phone?: string;
        role?: string;
      };

      const staff = await updateStaff(
        request.user.restaurantId,
        params.id,
        body
      );

      if (!staff) {
        return reply.code(404).send({
          statusCode: 404,
          message: "Staff not found",
        });
      }

      return staff;
    }
  );

  app.delete("/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const staff = await deleteStaff(
      request.user.restaurantId,
      params.id
    );

    if (!staff) {
      return reply.code(404).send({
        statusCode: 404,
        message: "Staff not found",
      });
    }

    return { ok: true };
  });
}
