import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

export const verifyUser = (...allowedRoles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      reply.status(401).send({
        success: false,
        message: "No token provided",
      });
      return;
    }

    try {
      const token = authHeader;
      request.user = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as FastifyRequest["user"];

      if (
        allowedRoles.length &&
        !allowedRoles.includes("ANY") &&
        !allowedRoles.includes(request.user.role)
      ) {
        reply.status(403).send({
          success: false,
          message:
            "Access denied! you have no permission to access this resource",
        });
        return;
      }
    } catch (error) {
      reply.status(401).send({
        success: false,
        message: "Invalid or expired token",
      });
      return;
    }
  };
};
