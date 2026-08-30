import { FastifyInstance } from "fastify";
import { login, register } from "./service";

export default async function authModule(app: FastifyInstance) {
  app.post(
    "/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["restaurantName", "name", "email", "password"],
          properties: {
            restaurantName: { type: "string", minLength: 2 },
            name: { type: "string", minLength: 2 },
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 6 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        restaurantName: string;
        name: string;
        email: string;
        password: string;
      };

      const result = await register(body);

      if ("error" in result) {
        return reply.code(result.statusCode).send({
          statusCode: result.statusCode,
          message: result.error,
        });
      }

      const token = await reply.jwtSign({
        id: result.user.id,
        restaurantId: result.user.restaurantId,
        role: result.user.role,
      });

      return { token, user: result.user };
    }
  );

  app.post(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 6 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        email: string;
        password: string;
      };

      const result = await login(body);

      if ("error" in result) {
        return reply.code(result.statusCode).send({
          statusCode: result.statusCode,
          message: result.error,
        });
      }

      const token = await reply.jwtSign({
        id: result.user.id,
        restaurantId: result.user.restaurantId,
        role: result.user.role,
      });

      return { token, user: result.user };
    }
  );

  app.get("/me", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = await app.db.orm.public.User
      .where({ id: request.user.id })
      .select("id", "name", "email", "role", "restaurantId")
      .first();

    if (!user) {
      return reply.code(404).send({
        statusCode: 404,
        message: "User not found",
      });
    }

    return user;
  });
}
