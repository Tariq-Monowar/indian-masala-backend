import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, prisma } from "../../../prisma/db";
import { forgotPasswordEmail } from "../../emails/auth.email";
import { FileService } from "../../config/storage.config";

export const createAdmin = async (request, reply) => {
  try {
    const { name, email, password } = request.body;

    const missingField = ["email", "name", "password"].find(
      (field) => !request.body[field],
    );

    if (missingField) {
      FileService.removeFile(request.file);
      return reply.status(400).send({
        success: false,
        message: `${missingField} is required!`,
      });
    }

    const existingUser = await db.users.where({ email }).first();

    if (existingUser) {
      FileService.removeFile(request.file);
      return reply.status(409).send({
        success: false,
        message: "Email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 8);
    const image = request.file ? request.file.filename : null;

    const user = await db.users.create({
      name,
      email,
      password: hashedPassword,
      image,
      role: "admin",
    });

    return reply.status(201).send({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
      },
    });
  } catch (error) {
    FileService.removeFile(request.file);
    request.log.error(error);
    reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const adminLogin = async (request, reply) => {
  try {
    const { email, password } = request.body;

    const missingField = ["email", "password"].find(
      (field) => !request.body[field],
    );

    if (missingField) {
      return reply.status(400).send({
        success: false,
        message: `${missingField} is required!`,
      });
    }

    const user = await db.users.where({ email }).first();

    if (!user || !user.password) {
      return reply.status(401).send({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return reply.status(401).send({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      { userId: user.id, id: user.id, role: user.role },
      process.env.JWT_SECRET!,
    );

    return reply.status(200).send({
      success: true,
      token,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        image: user.image,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const forgotPasswordSendOtp = async (request, reply) => {
  try {
    const { email } = request.body;

    if (!email) {
      return reply.status(400).send({
        success: false,
        message: "email is required!",
      });
    }

    const existingUser = await db.users.where({ email }).first();

    if (!existingUser) {
      return reply.status(404).send({
        success: false,
        message: "User with this email does not exist",
      });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpiry = Date.now() + 5 * 60 * 1000;
    const redis = request.server.redis;

    await forgotPasswordEmail(email, otp);

    await redis
      .multi()
      .hset(`forgot-password-otp:${email}`, {
        email,
        otp,
        expiration: otpExpiry.toString(),
        userId: existingUser.id.toString(),
        permission_to_update_password: "false",
      })
      .expire(`forgot-password-otp:${email}`, 5 * 60)
      .exec();

    return reply.status(200).send({
      success: true,
      message: "OTP sent to your email",
      otp: process.env.NODE_ENV === "development" ? otp : null,
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const forgotPasswordVerifyOtp = async (request, reply) => {
  try {
    const { email, otp } = request.body;

    const missingField = ["email", "otp"].find((field) => !request.body[field]);

    if (missingField) {
      return reply.status(400).send({
        success: false,
        message: `${missingField} is required!`,
      });
    }

    const redis = request.server.redis;
    const otpData = await redis.hgetall(`forgot-password-otp:${email}`);

    if (!Object.keys(otpData || {}).length) {
      return reply.status(400).send({
        success: false,
        message: "OTP not found or expired!",
      });
    }

    if (otpData.otp !== otp) {
      return reply.status(400).send({
        success: false,
        message: "Invalid OTP!",
      });
    }

    if (Date.now() > parseInt(otpData.expiration)) {
      return reply.status(400).send({
        success: false,
        message: "OTP expired!",
      });
    }

    await redis.hset(`forgot-password-otp:${email}`, {
      permission_to_update_password: "true",
    });
    await redis.expire(`forgot-password-otp:${email}`, 10 * 60);

    return reply.status(200).send({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const forgotPasswordReset = async (request, reply) => {
  try {
    const { email, password } = request.body;

    const missingField = ["email", "password"].find(
      (field) => !request.body[field],
    );

    if (missingField) {
      return reply.status(400).send({
        success: false,
        message: `${missingField} is required!`,
      });
    }

    const redis = request.server.redis;
    const otpData = await redis.hgetall(`forgot-password-otp:${email}`);

    if (!Object.keys(otpData || {}).length) {
      return reply.status(400).send({
        success: false,
        message: "Password reset session expired!",
      });
    }

    if (otpData.permission_to_update_password !== "true") {
      return reply.status(400).send({
        success: false,
        message: "Permission to update password not granted!",
      });
    }

    const user = await db.users.where({ email }).first();

    if (!user) {
      return reply.status(404).send({
        success: false,
        message: "User not found!",
      });
    }

    await db.users.where({ email }).update({
      password: await bcrypt.hash(password, 8),
    });

    await redis.del(`forgot-password-otp:${email}`);

    return reply.status(200).send({
      success: true,
      message: "Password reset successfully!",
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const forgotPasswordRecentOtp = async (request, reply) => {
  try {
    const { email } = request.body;

    if (!email) {
      return reply.status(400).send({
        success: false,
        message: "email is required!",
      });
    }

    const existingUser = await db.users.where({ email }).first();

    if (!existingUser) {
      return reply.status(404).send({
        success: false,
        message: "User with this email does not exist",
      });
    }

    const redis = request.server.redis;
    const otpData = await redis.hgetall(`forgot-password-otp:${email}`);

    if (!Object.keys(otpData || {}).length) {
      return reply.status(404).send({
        success: false,
        message: "No active OTP session found. Please request a new OTP.",
      });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpiry = Date.now() + 5 * 60 * 1000;

    await redis
      .multi()
      .hset(`forgot-password-otp:${email}`, {
        ...otpData,
        otp,
        expiration: otpExpiry.toString(),
      })
      .expire(`forgot-password-otp:${email}`, 5 * 60)
      .exec();

    await forgotPasswordEmail(email, otp);

    return reply.status(200).send({
      success: true,
      message: "New OTP sent successfully",
      otp: process.env.NODE_ENV === "development" ? otp : null,
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const changePassword = async (request, reply) => {
  try {
    const { current_password, new_password } = request.body;

    if (!current_password) {
      return reply.status(400).send({
        success: false,
        message: "current_password is required!",
      });
    }

    if (!new_password) {
      return reply.status(400).send({
        success: false,
        message: "new_password is required!",
      });
    }

    const { id } = request.user;
    const user = await db.users.where({ id }).first();

    if (!user || !user.password) {
      return reply.status(404).send({
        success: false,
        message: "User not found!",
      });
    }

    const isMatch = await bcrypt.compare(current_password, user.password);

    if (!isMatch) {
      return reply.status(400).send({
        success: false,
        message: "Current password is incorrect!",
      });
    }

    await db.users.where({ id }).update({
      password: await bcrypt.hash(new_password, 8),
    });

    return reply.status(200).send({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const checkAuth = async (request, reply) => {
  try {
    const { id } = request.user;

    if (!id) {
      return reply.status(401).send({
        success: false,
        message: "Unauthorized",
      });
    }

    const plan = prisma.raw.sql`
      SELECT
        u.name,
        u.email,
        u.phone,
        u.image,
        u.role,
        u."createdAt"
      FROM users u
      WHERE u.id = ${id}
      LIMIT 1
    `
      .returnsRow({
        name: { codecId: "pg/text@1", nullable: true },
        email: "pg/text@1",
        phone: { codecId: "pg/text@1", nullable: true },
        image: { codecId: "pg/text@1", nullable: true },
        role: "pg/text@1",
        createdAt: "pg/timestamptz-string@1",
      })
      .build();

    const result = await prisma.runtime().query(plan);
    const list = Array.isArray(result) ? result : [];
    const user = list[0];

    if (!user) {
      return reply.status(401).send({
        success: false,
        message: "Unauthorized",
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        image: user.image,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};
