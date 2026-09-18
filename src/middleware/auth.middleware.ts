import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

export const verifyUser = (...allowedRoles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = (request.headers.token || request.headers.authorization) as
      string | undefined;

    if (!token) {
      reply.status(401).send({
        success: false,
        message: "No token provided",
      });
      return;
    }

    try {
      request.user = jwt.verify(
        token,
        process.env.JWT_SECRET as string,
      ) as FastifyRequest["user"];

      if (
        allowedRoles.length &&
        !allowedRoles.includes("any") &&
        !allowedRoles.includes(request.user.role)
      ) {
        reply.status(403).send({
          success: false,
          message:
            "Access denied! you have no permission to access this resource",
        });
        return;
      }
    } catch {
      reply.status(401).send({
        success: false,
        message: "Invalid or expired token",
      });
      return;
    }
  };
};
