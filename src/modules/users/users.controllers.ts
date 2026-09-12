import bcrypt from "bcryptjs";
import { db } from "../../../prisma/db";

export const createAdmin = async (request, reply) => {
  try {
    const { name, email, password } = request.body;

    const missingField = ["email", "name", "password"].find(
      (field) => !request.body[field],
    );

    if (missingField) {
      return reply.status(400).send({
        success: false,
        message: `${missingField} is required!`,
      });
    }


    const existingUser = await db.users.where({ email }).first();

    if (existingUser) {
      return reply.status(409).send({
        success: false,
        message: "Email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 8);


    const user = await db.users.create({
      name,
      email,
      password: hashedPassword,
      role: "admin",
    });

    return reply.status(201).send({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};
