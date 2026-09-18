import jwt from "jsonwebtoken";
import { db } from "../../../prisma/db";
import { notify } from "../../notifications";
import { orderOtpTemplate } from "../../notifications/email/templates/order.otp";

export const createOrder = async (request, reply) => {
  try {
    const { name, email, phone, order_item } = request.body;
    const headerToken = request.headers.token || request.headers.authorization;

    if (!order_item?.length) {
      return reply
        .status(400)
        .send({ success: false, message: "order_item is required!" });
    }

    let user: any = null;
    let newToken: string | null = null;
    let needsOtp = false;

    if (headerToken) {
      const payload = jwt.verify(
        headerToken as string,
        process.env.JWT_SECRET as string,
      ) as { id: string };

      user = await db.users.where({ id: payload.id }).first();
      if (!user) {
        return reply
          .status(401)
          .send({ success: false, message: "Invalid token" });
      }
    } else {
      if (!name || !email || !phone) {
        return reply.status(400).send({
          success: false,
          message: "name, email and phone are required!",
        });
      }

      user = await db.users.where({ email }).first();

      if (user) {
        needsOtp = true;
      } else {
        user = await db.users.create({
          name,
          email,
          phone,
          role: "customer",
        });

        newToken = jwt.sign(
          { id: user.id, email: user.email, role: user.role },
          process.env.JWT_SECRET as string,
        );
      }
    }

    if (!user) {
      return reply
        .status(401)
        .send({ success: false, message: "User not found" });
    }

    let total_price = 0;
    const lines: any[] = [];

    for (const item of order_item) {
      if (!item.id || !item.quantity) {
        return reply.status(400).send({
          success: false,
          message: "each order_item needs id and quantity!",
        });
      }

      const menu = await db.menu.where({ id: item.id }).first();
      if (!menu) {
        return reply
          .status(404)
          .send({ success: false, message: "Menu item not found!" });
      }

      const unit_price = menu.min_price ?? menu.max_price ?? 0;
      const quantity = Number(item.quantity);
      total_price += unit_price * quantity;

      lines.push({
        menu_id: item.id,
        food_name: menu.food_name,
        unit_price,
        quantity,
      });
    }

    if (needsOtp) {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      const expiration = Date.now() + 10 * 60 * 1000;
      const redis = request.server.redis;
      const key = `order-pending:${email}`;

      await redis
        .multi()
        .set(
          key,
          JSON.stringify({
            email,
            user_id: user.id,
            total_price,
            lines,
            otp: code,
            expiration,
          }),
        )
        .expire(key, 10 * 60)
        .exec();

      void notify({
        email: {
          to: email,
          subject: "Order Verification Code",
          html: orderOtpTemplate(code),
        },
      });

      return reply.status(200).send({
        success: true,
        message: "OTP sent to your email",
        otp: process.env.NODE_ENV === "development" ? code : null,
      });
    }

    const order = await (db as any).order.create({
      user_id: user.id,
      total_price,
      status: "pending",
    });

    for (const line of lines) {
      await (db as any).order_item.create({ order_id: order.id, ...line });
    }

    void notify({
      io: request.server.io,
      inApp: {
        message: `New order for ${total_price} with ${lines.length} item(s).`,
        type: "new_order",
        object_id: order.id,
        role: "admin",
      },
    });

    return reply.status(201).send({
      success: true,
      message: "Order created successfully",
      ...(newToken && { token: newToken }),
    });
  } catch (error: any) {
    if (
      error?.name === "JsonWebTokenError" ||
      error?.name === "TokenExpiredError"
    ) {
      return reply
        .status(401)
        .send({ success: false, message: "Invalid token" });
    }

    request.log.error(error);
    return reply
      .status(500)
      .send({ success: false, message: "Internal server error" });
  }
};

export const verifyOrderOtp = async (request, reply) => {
  try {
    const { email, otp } = request.body;

    if (!email || !otp) {
      return reply.status(400).send({
        success: false,
        message: "email and otp are required!",
      });
    }

    const redis = request.server.redis;
    const key = `order-pending:${email}`;
    const raw = await redis.get(key);

    if (!raw) {
      return reply.status(400).send({
        success: false,
        message: "OTP not found or expired!",
      });
    }

    const pending = JSON.parse(raw);

    if (pending.otp !== otp) {
      return reply
        .status(400)
        .send({ success: false, message: "Invalid OTP!" });
    }

    if (Date.now() > pending.expiration) {
      await redis.del(key);
      return reply
        .status(400)
        .send({ success: false, message: "OTP expired!" });
    }

    const order = await (db as any).order.create({
      user_id: pending.user_id,
      total_price: pending.total_price,
      status: "pending",
    });

    for (const line of pending.lines) {
      await (db as any).order_item.create({ order_id: order.id, ...line });
    }

    await redis.del(key);

    const user = await db.users.where({ id: pending.user_id }).first();
    if (!user) {
      return reply
        .status(404)
        .send({ success: false, message: "User not found" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET as string,
    );

    void notify({
      io: request.server.io,
      inApp: {
        message: `New order for ${pending.total_price} with ${pending.lines.length} item(s).`,
        type: "new_order",
        object_id: order.id,
        role: "admin",
      },
    });

    return reply.status(201).send({
      success: true,
      message: "Order created successfully",
      token,
    });
  } catch (error) {
    request.log.error(error);
    return reply
      .status(500)
      .send({ success: false, message: "Internal server error" });
  }
};
