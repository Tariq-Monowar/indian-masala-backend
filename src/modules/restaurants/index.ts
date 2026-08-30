import { FastifyInstance } from "fastify";
import { getMyRestaurant, updateMyRestaurant } from "./service";

export default async function restaurantsModule(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/me", async (request, reply) => {
    const restaurant = await getMyRestaurant(request.user.restaurantId);

    if (!restaurant) {
      return reply.code(404).send({
        statusCode: 404,
        message: "Restaurant not found",
      });
    }

    return restaurant;
  });

  app.patch(
    "/me",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 2 },
            phone: { type: "string" },
            address: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        name?: string;
        phone?: string;
        address?: string;
      };

      const restaurant = await updateMyRestaurant(
        request.user.restaurantId,
        body
      );

      if (!restaurant) {
        return reply.code(404).send({
          statusCode: 404,
          message: "Restaurant not found",
        });
      }

      return restaurant;
    }
  );
}
