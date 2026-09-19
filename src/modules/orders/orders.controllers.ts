import jwt from "jsonwebtoken";
import { db, prisma } from "../../../prisma/db";
import { notify } from "../../notifications";
import { orderOtpTemplate } from "../../notifications/email/templates/order.otp";

const nextOrderNumber = async () => {
  const rows = await (db as any).order.select("id").all();
  return String((rows?.length || 0) + 1).padStart(4, "0");
};



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

      const menu = await db.menu
        .where({ id: item.id })
        .select("id", "food_name", "min_price", "max_price")
        .first();
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

    const order_number = await nextOrderNumber();

    const order = await (db as any).order.create({
      user_id: user.id,
      order_number,
      total_price,
      status: "pending",
    });

    for (const line of lines) {
      await (db as any).order_item.create({ order_id: order.id, ...line });
    }

    void notify({
      io: request.server.io,
      inApp: {
        message: `New order #${order_number} for ${total_price} with ${lines.length} item(s).`,
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

    const order_number = await nextOrderNumber();

    const order = await (db as any).order.create({
      user_id: pending.user_id,
      order_number,
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
        message: `New order #${order_number} for ${pending.total_price} with ${pending.lines.length} item(s).`,
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

export const getAllOrders = async (request, reply) => {
  try {
    const { cursor, limit, search, status, started_date, end_date, object_id } =
      request.query;
    const take = Number(limit) > 50 ? 50 : Number(limit) || 20;

    const searchPattern = search ? "%" + search.split(" ").join("%") + "%" : "";
    const digitSearch = search
      ? String(search).replace(/\D/g, "")
      : "";
    const digitPattern = digitSearch ? "%" + digitSearch + "%" : "";
    const statusCsv = status || "";
    const cursorId = cursor || "";
    const pinnedId = object_id || "";
    const useStart = started_date ? 1 : 0;
    const startDate = started_date || "1970-01-01";
    const useEnd = end_date ? 1 : 0;
    const endDate = end_date || "1970-01-01";

    const plan = prisma.raw.sql`
      SELECT
        o.id,
        o.order_number,
        u.name,
        u.email,
        u.phone,
        o.total_price,
        o.status,
        o."createdAt",
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'name', m.food_name,
                'quantity', oi.quantity
              )
              ORDER BY oi."createdAt" ASC
            )
            FROM order_item oi
            LEFT JOIN menu m ON m.id = oi.menu_id
            WHERE oi.order_id = o.id
          ),
          '[]'::json
        ) AS "order"
      FROM "order" o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE
        (
          ${searchPattern} = ''
          OR (
            COALESCE(o.id, '') || ' ' ||
            COALESCE(o.order_number, '') || ' ' ||
            COALESCE(ltrim(o.order_number, '0'), '') || ' ' ||
            COALESCE(u.name, '') || ' ' ||
            COALESCE(u.email, '') || ' ' ||
            COALESCE(u.phone, '') || ' ' ||
            regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g') || ' ' ||
            COALESCE(o.status, '') || ' ' ||
            COALESCE(o.total_price::text, '') || ' ' ||
            COALESCE(
              (
                SELECT string_agg(
                  COALESCE(m.food_name, '') || ' ' ||
                  COALESCE(oi.quantity::text, '') || ' ' ||
                  COALESCE(oi.unit_price::text, ''),
                  ' '
                )
                FROM order_item oi
                LEFT JOIN menu m ON m.id = oi.menu_id
                WHERE oi.order_id = o.id
              ),
              ''
            )
          ) ILIKE ${searchPattern}
          OR (
            ${digitPattern} <> ''
            AND regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g')
              LIKE ${digitPattern}
          )
        )
        AND (
          ${statusCsv} = ''
          OR lower(o.status) = ANY(
            SELECT lower(trim(s))
            FROM unnest(string_to_array(${statusCsv}, ',')) AS s
          )
        )
        AND (${useStart} = 0 OR o."createdAt" >= ${startDate}::date)
        AND (${useEnd} = 0 OR o."createdAt" < (${endDate}::date + interval '1 day'))
        AND (
          ${cursorId} = ''
          OR NOT EXISTS (SELECT 1 FROM "order" c WHERE c.id = ${cursorId})
          OR (o."createdAt", o.id) < (
            SELECT c."createdAt", c.id FROM "order" c WHERE c.id = ${cursorId}
          )
        )
      ORDER BY
        CASE WHEN o.id = ${pinnedId} THEN 0 ELSE 1 END,
        o."createdAt" DESC,
        o.id DESC
      LIMIT ${take + 1}
    `
      .returnsRow({
        id: "pg/text@1",
        order_number: { codecId: "pg/text@1", nullable: true },
        name: { codecId: "pg/text@1", nullable: true },
        email: { codecId: "pg/text@1", nullable: true },
        phone: { codecId: "pg/text@1", nullable: true },
        total_price: { codecId: "pg/float8@1", nullable: true },
        status: { codecId: "pg/text@1", nullable: true },
        createdAt: "pg/timestamptz-string@1",
        order: "pg/json@1",
      })
      .build();

    const result = await prisma.runtime().query(plan);
    const list = Array.isArray(result) ? result : [];
    const hasMore = list.length > take;
    const rows = hasMore ? list.slice(0, take) : list;

    return reply.status(200).send({
      success: true,
      data: rows,
      pagination: { hasMore },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getSingleOrder = async (request, reply) => {
  try {
    const { id } = request.params;

    if (!id) {
      return reply
        .status(400)
        .send({ success: false, message: "id is required!" });
    }

    const plan = prisma.raw.sql`
      SELECT
        o.id,
        o.order_number,
        o.total_price,
        o.status,
        o."createdAt",
        u.name AS customer_name,
        u.email AS customer_email,
        u.phone AS customer_phone,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'name', m.food_name,
                'quantity', oi.quantity,
                'image', (
                  SELECT i.image
                  FROM menu_image i
                  WHERE i.menu_id = m.id
                  ORDER BY i."createdAt" ASC
                  LIMIT 1
                )
              )
              ORDER BY oi."createdAt" ASC
            )
            FROM order_item oi
            LEFT JOIN menu m ON m.id = oi.menu_id
            WHERE oi.order_id = o.id
          ),
          '[]'::json
        ) AS orders
      FROM "order" o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.id = ${id}
      LIMIT 1
    `
      .returnsRow({
        id: "pg/text@1",
        order_number: { codecId: "pg/text@1", nullable: true },
        total_price: { codecId: "pg/float8@1", nullable: true },
        status: { codecId: "pg/text@1", nullable: true },
        createdAt: "pg/timestamptz-string@1",
        customer_name: { codecId: "pg/text@1", nullable: true },
        customer_email: { codecId: "pg/text@1", nullable: true },
        customer_phone: { codecId: "pg/text@1", nullable: true },
        orders: "pg/json@1",
      })
      .build();

    const result = await prisma.runtime().query(plan);
    const list = Array.isArray(result) ? result : [];
    const row = list[0];

    if (!row) {
      return reply
        .status(404)
        .send({ success: false, message: "Order not found!" });
    }

    return reply.status(200).send({
      success: true,
      data: {
        id: row.id,
        order_number: row.order_number,
        customer: {
          name: row.customer_name,
          email: row.customer_email,
          phone: row.customer_phone,
        },
        orders: row.orders,
        total_price: row.total_price,
        status: row.status,
        createdAt: row.createdAt,
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

export const updateOrderStatus = async (request, reply) => {
  try {
    const { ids, status } = request.body;

    if (!ids || !ids.length) {
      return reply
        .status(400)
        .send({ success: false, message: "ids is required!" });
    }

    if (!status) {
      return reply
        .status(400)
        .send({ success: false, message: "status is required!" });
    }

    if (
      status !== "pending" &&
      status !== "confirmed" &&
      status !== "preparing" &&
      status !== "completed" &&
      status !== "cancelled"
    ) {
      return reply.status(400).send({
        success: false,
        message:
          "status must be pending, confirmed, preparing, completed or cancelled!",
      });
    }

    for (const id of ids) {
      const existing = await (db as any).order.where({ id }).first();
      if (!existing) continue;
      await (db as any).order.where({ id }).update({ status });
    }

    return reply.status(200).send({
      success: true,
      message: "Order status updated successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteOrderBulk = async (request, reply) => {
  try {
    const { ids } = request.body;

    if (!ids || !ids.length) {
      return reply
        .status(400)
        .send({ success: false, message: "ids is required!" });
    }

    for (const id of ids) {
      await (db as any).order.where({ id }).delete();
    }

    return reply.status(200).send({
      success: true,
      message: "Orders deleted successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};
