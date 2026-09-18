import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

export const verifyUser = (...allowedRoles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const raw =
      request.headers.token ||
      request.headers.authorization ||
      request.headers["x-access-token"];

    let token = Array.isArray(raw) ? raw[0] : raw;

    if (!token) {
      reply.status(401).send({
        success: false,
        message: "No token provided",
      });
      return;
    }

    token = String(token).trim();
    if (/^bearer\s+/i.test(token)) {
      token = token.replace(/^bearer\s+/i, "").trim();
    }
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      token = token.slice(1, -1).trim();
    }

    try {
      request.user = jwt.verify(
        token,
        process.env.JWT_SECRET!,
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
      request.log.error(
        {
          err: error,
          hasTokenHeader: Boolean(request.headers.token),
          hasAuthorization: Boolean(request.headers.authorization),
          tokenPreview: token.slice(0, 20),
        },
        "jwt verify failed",
      );
      reply.status(401).send({
        success: false,
        message: "Invalid token",
      });
      return;
    }
  };
};
