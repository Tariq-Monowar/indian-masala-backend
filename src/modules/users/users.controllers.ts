import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, prisma } from "../../../prisma/db";
import { notify } from "../../notifications";
import {
  authOtpTemplate,
  emailChangeOtpTemplate,
} from "../../notifications/email/templates/auth.otp";
import { FileService } from "../../config/storage.config";
import {
  ensureCustomerAccount,
  findCustomerByPhone,
  phoneDigits,
} from "./customer-account";

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
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET!,
    );

    return reply.status(200).send({
      success: true,
      token,
    });
  } catch (error) {
    reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const customerLogin = async (request, reply) => {
  try {
    const { phone } = request.body;
    const digits = phoneDigits(phone);

    if (digits.length < 6) {
      return reply.status(400).send({
        success: false,
        message: "phone is required!",
      });
    }

    let customer = await findCustomerByPhone(String(phone));

    if (!customer) {
      const plan = prisma.raw.sql`
        SELECT name, email, phone
        FROM "order"
        WHERE
          regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = ${digits}
          OR (
            length(${digits}) >= 9
            AND length(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 9
            AND right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 9)
              = right(${digits}, 9)
          )
        ORDER BY "createdAt" DESC
        LIMIT 1
      `
        .returnsRow({
          name: { codecId: "pg/text@1", nullable: true },
          email: { codecId: "pg/text@1", nullable: true },
          phone: { codecId: "pg/text@1", nullable: true },
        })
        .build();

      const result = await prisma.runtime().query(plan);
      const list = Array.isArray(result) ? result : [];
      const orderCustomer = list[0];

      if (!orderCustomer?.phone) {
        return reply.status(404).send({
          success: false,
          message: "Customer not found",
        });
      }

      customer = await ensureCustomerAccount({
        name: orderCustomer.name || "Guest",
        phone: orderCustomer.phone,
        email: orderCustomer.email,
      });
    }

    const token = jwt.sign(
      {
        id: customer.id,
        name: customer.name,
        email: customer.email || "",
        phone: customer.phone,
        role: "customer",
      },
      process.env.JWT_SECRET!,
    );

    return reply.status(200).send({
      success: true,
      token,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
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

    void notify({
      email: {
        to: email,
        subject: "Password Reset Verification Code",
        html: authOtpTemplate(otp),
      },
    });

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

    void notify({
      email: {
        to: email,
        subject: "Password Reset Verification Code",
        html: authOtpTemplate(otp),
      },
    });

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

const EMAIL_CHANGE_SECONDS = 5 * 60;
const EMAIL_CHANGE_SESSION_SECONDS = 15 * 60;
const emailChangeMemory = new Map();

function emailChangeKey(userId) {
  return `admin-email-change:${userId}`;
}

function blankEmailChange() {
  return {
    current_email: "",
    current_verified: "false",
    new_email: "",
    otp: "",
    expiration: "",
  };
}

function readEmailChangeMemory(key) {
  const row = emailChangeMemory.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    emailChangeMemory.delete(key);
    return null;
  }
  return row.fields;
}

function writeEmailChangeMemory(key, fields, ttlSeconds) {
  const current = readEmailChangeMemory(key) || blankEmailChange();
  emailChangeMemory.set(key, {
    fields: { ...current, ...fields },
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

async function readEmailChange(redis, key) {
  const local = readEmailChangeMemory(key);
  if (local) return local;
  if (redis?.status !== "ready") return null;
  try {
    const saved = await redis.hgetall(key);
    if (saved && Object.keys(saved).length > 0) return saved;
  } catch {
    return null;
  }
  return null;
}

async function writeEmailChange(redis, key, fields, ttlSeconds) {
  writeEmailChangeMemory(key, fields, ttlSeconds);
  if (redis?.status !== "ready") return;
  try {
    const saved = readEmailChangeMemory(key) || {
      ...blankEmailChange(),
      ...fields,
    };
    await redis.hset(key, saved);
    await redis.expire(key, ttlSeconds);
  } catch {
    // Local Redis is optional. The in-memory copy still expires on time.
  }
}

async function deleteEmailChange(redis, key) {
  emailChangeMemory.delete(key);
  if (redis?.status !== "ready") return;
  try {
    await redis.del(key);
  } catch {
    // The in-memory copy is already gone.
  }
}

function fourDigitCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function emailTakenByOther(email, userId) {
  const plan = prisma.raw.sql`
    SELECT id
    FROM users
    WHERE lower(email) = ${email} AND id <> ${userId}
    LIMIT 1
  `
    .returnsRow({ id: "pg/text@1" })
    .build();
  const rows = await prisma.runtime().query(plan);
  return Array.isArray(rows) && rows.length > 0;
}

export const sendCurrentEmailOtp = async (request, reply) => {
  try {
    const { id } = request.user;
    const user = await db.users.where({ id }).first();
    const currentEmail = normalizeEmail(user?.email);

    if (!user || !currentEmail) {
      return reply.status(404).send({
        success: false,
        message: "User not found!",
      });
    }

    const otp = fourDigitCode();
    const key = emailChangeKey(id);
    await writeEmailChange(
      request.server.redis,
      key,
      {
        current_email: currentEmail,
        current_verified: "false",
        new_email: "",
        otp,
        expiration: String(Date.now() + EMAIL_CHANGE_SECONDS * 1000),
      },
      EMAIL_CHANGE_SECONDS,
    );

    await notify({
      email: {
        to: currentEmail,
        subject: "Confirm your email change — Indian Masala",
        html: emailChangeOtpTemplate(otp, "current"),
      },
    });

    return reply.status(200).send({
      success: true,
      message: "Code sent to your current email",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const verifyCurrentEmailOtp = async (request, reply) => {
  try {
    const { id } = request.user;
    const otp = String(request.body?.otp ?? "").trim();
    if (!/^\d{4}$/.test(otp)) {
      return reply.status(400).send({
        success: false,
        message: "A 4-digit code is required!",
      });
    }

    const redis = request.server.redis;
    const key = emailChangeKey(id);
    const saved = await readEmailChange(redis, key);
    if (!saved?.otp || saved.current_verified === "true") {
      return reply.status(400).send({
        success: false,
        message: "Send a code to your current email first",
      });
    }
    if (Date.now() > Number(saved.expiration)) {
      await deleteEmailChange(redis, key);
      return reply.status(400).send({
        success: false,
        message: "Code expired",
      });
    }
    if (saved.otp !== otp) {
      return reply.status(400).send({
        success: false,
        message: "Invalid verification code",
      });
    }

    await writeEmailChange(
      redis,
      key,
      {
        current_verified: "true",
        otp: "",
        expiration: "",
      },
      EMAIL_CHANGE_SESSION_SECONDS,
    );

    return reply.status(200).send({
      success: true,
      message: "Current email confirmed",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const sendNewEmailOtp = async (request, reply) => {
  try {
    const { id } = request.user;
    const email = normalizeEmail(request.body?.email);
    if (!isEmail(email)) {
      return reply.status(400).send({
        success: false,
        message: "A valid email is required!",
      });
    }

    const redis = request.server.redis;
    const key = emailChangeKey(id);
    const saved = await readEmailChange(redis, key);
    if (saved?.current_verified !== "true") {
      return reply.status(400).send({
        success: false,
        message: "Confirm your current email first",
      });
    }
    if (email === saved.current_email) {
      return reply.status(400).send({
        success: false,
        message: "Enter a different email",
      });
    }
    if (await emailTakenByOther(email, id)) {
      return reply.status(409).send({
        success: false,
        message: "Email already exists",
      });
    }

    const otp = fourDigitCode();
    await writeEmailChange(
      redis,
      key,
      {
        new_email: email,
        otp,
        expiration: String(Date.now() + EMAIL_CHANGE_SECONDS * 1000),
      },
      EMAIL_CHANGE_SESSION_SECONDS,
    );

    await notify({
      email: {
        to: email,
        subject: "Confirm your new email — Indian Masala",
        html: emailChangeOtpTemplate(otp, "new"),
      },
    });

    return reply.status(200).send({
      success: true,
      message: "Code sent to the new email",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const confirmEmailChange = async (request, reply) => {
  try {
    const { id, role } = request.user;
    const email = normalizeEmail(request.body?.email);
    const otp = String(request.body?.otp ?? "").trim();

    if (!isEmail(email) || !/^\d{4}$/.test(otp)) {
      return reply.status(400).send({
        success: false,
        message: "Email and a 4-digit code are required!",
      });
    }

    const redis = request.server.redis;
    const key = emailChangeKey(id);
    const saved = await readEmailChange(redis, key);
    if (saved?.current_verified !== "true" || saved.new_email !== email) {
      return reply.status(400).send({
        success: false,
        message: "Send a code to the new email first",
      });
    }
    if (!saved.otp || Date.now() > Number(saved.expiration)) {
      await writeEmailChange(
        redis,
        key,
        { otp: "", expiration: "0" },
        EMAIL_CHANGE_SESSION_SECONDS,
      );
      return reply.status(400).send({
        success: false,
        message: "Code expired",
      });
    }
    if (saved.otp !== otp) {
      return reply.status(400).send({
        success: false,
        message: "Invalid verification code",
      });
    }
    if (await emailTakenByOther(email, id)) {
      return reply.status(409).send({
        success: false,
        message: "Email already exists",
      });
    }

    const updated = await db.users.where({ id }).update({ email });
    if (!updated) {
      return reply.status(404).send({
        success: false,
        message: "User not found!",
      });
    }

    await deleteEmailChange(redis, key);

    const token = jwt.sign(
      { id, email, role: role || "admin" },
      process.env.JWT_SECRET!,
    );

    return reply.status(200).send({
      success: true,
      message: "Email updated",
      token,
      data: { email },
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
