import jwt from "jsonwebtoken";
import { db, prisma } from "../../../prisma/db";
import { notify } from "../../notifications";
import { markObjectNotificationsRead } from "../../notifications/in_app/mark-handled";
import {
  ensureCustomerAccount,
  normalizeOptionalEmail,
  phoneDigits,
} from "../users/customer-account";
import { ensureOrderSpecialColumns } from "../../utils/ensure-sort-columns";

let specialColumnsReady: Promise<void> | null = null;

function readySpecialColumns() {
  specialColumnsReady ??= ensureOrderSpecialColumns().catch((error) => {
    specialColumnsReady = null;
    throw error;
  });
  return specialColumnsReady;
}

function parisToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
  }).format(new Date());
}

function readPickup(body) {
  const pickupDate = String(body?.pickup_date || "").trim();
  const pickupTime = String(body?.pickup_time || "").trim();
  const specialRequest = String(body?.special_request || "").trim().slice(0, 500);

  let error = "";
  if (pickupDate && (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || pickupDate < parisToday())) {
    error = "pickup date is invalid";
  } else if (pickupTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(pickupTime)) {
    error = "pickup time is invalid";
  }

  return {
    isSpecial: false,
    pickupDate,
    pickupTime,
    specialRequest,
    error,
  };
}

export const createOrder = async (request, reply) => {
  try {
    await readySpecialColumns();
    const { name, email, phone, order_item } = request.body || {};
    const special = readPickup(request.body);
    if (special.error) {
      return reply.status(400).send({ success: false, message: special.error });
    }

    if (!name) {
      return reply
        .status(400)
        .send({ success: false, message: "name is required!" });
    }

    const customerEmail = normalizeOptionalEmail(email);
    if (customerEmail === null) {
      return reply
        .status(400)
        .send({ success: false, message: "email is invalid!" });
    }

    if (!phone || phoneDigits(phone).length < 6) {
      return reply
        .status(400)
        .send({ success: false, message: "phone is required!" });
    }

    if (!order_item?.length) {
      return reply
        .status(400)
        .send({ success: false, message: "order_item is required!" });
    }

    let total_price = 0;
    const lines: { menu_id: string; unit_price: number; quantity: number }[] = [];

    for (const item of order_item) {
      if (!item.id || !item.quantity) {
        return reply.status(400).send({
          success: false,
          message: "each order_item needs id and quantity!",
        });
      }

      const menu = await db.menu
        .where({ id: item.id })
        .select("id", "food_name", "min_price", "max_price", "is_available")
        .first();
      if (!menu) {
        return reply
          .status(404)
          .send({ success: false, message: "Menu item not found!" });
      }

      if (menu.is_available === false) {
        return reply.status(400).send({
          success: false,
          message: `${menu.food_name || "Item"} is not available!`,
        });
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

    const numberPlan = prisma.raw.sql`
      SELECT COUNT(*)::int AS total FROM "order"
    `
      .returnsRow({
        total: "pg/int4@1",
      })
      .build();
    const numberResult = await prisma.runtime().query(numberPlan);
    const numberList = Array.isArray(numberResult) ? numberResult : [];
    const order_number = String(Number(numberList[0]?.total || 0) + 1).padStart(
      4,
      "0",
    );

    const customer = await ensureCustomerAccount({
      name,
      phone: String(phone).trim(),
      email: customerEmail,
    });

    const order = await db.order.create({
      name,
      email: customerEmail || null,
      phone: String(phone).trim(),
      user_id: customer.id,
      order_number,
      total_price,
      status: "pending",
    });

    for (const line of lines) {
      await db.order_item.create({ order_id: order.id, ...line });
    }

    await prisma.runtime().query(
      prisma.raw.sql`
        UPDATE "order"
        SET is_special = false,
            pickup_date = ${special.pickupDate},
            pickup_time = ${special.pickupTime},
            special_request = ${special.specialRequest}
        WHERE id = ${order.id}
      `
        .affectedCount()
        .build(),
    );

    const specialNote =
      special.pickupDate || special.pickupTime || special.specialRequest
        ? ` Pickup ${special.pickupDate} ${special.pickupTime}${
            special.specialRequest ? `: ${special.specialRequest}` : ""
          }.`
        : "";

    void notify({
      io: request.server.io,
      inApp: {
        message: `New order #${order_number} from ${name} for ${total_price} with ${lines.length} item(s).${specialNote}`,
        type: "new_order",
        object_id: order.id,
        role: "admin",
      },
    });

    const token = jwt.sign(
      {
        id: customer.id,
        name: customer.name || name,
        email: customer.email || customerEmail || "",
        phone: customer.phone || String(phone).trim(),
        role: "customer",
      },
      process.env.JWT_SECRET as string,
    );

    return reply.status(201).send({
      success: true,
      message: "Order created successfully",
      id: order.id,
      order_number,
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
    await readySpecialColumns();
    const {
      cursor,
      page,
      limit,
      search,
      status,
      started_date,
      end_date,
      object_id,
      email,
      order_number,
    } = request.query;
    const take = Number(limit) > 50 ? 50 : Number(limit) || 20;
    const pageNumber = Math.max(0, Math.floor(Number(page)) || 0);
    const offset = pageNumber > 0 ? (pageNumber - 1) * take : 0;

    const searchPattern = search ? "%" + search.split(" ").join("%") + "%" : "";
    const digitSearch = search ? String(search).replace(/\D/g, "") : "";
    const digitPattern = digitSearch ? "%" + digitSearch + "%" : "";
    const statusCsv = status || "";
    const cursorId = pageNumber > 0 ? "" : cursor || "";
    const pinnedId = object_id || "";
    const orderNumberFilter = order_number || "";
    const tokenUser = request.user || {};
    const emailFilter = tokenUser.role === "customer" ? "" : email || "";
    const phoneFilter =
      tokenUser.role === "customer" ? phoneDigits(tokenUser.phone) : "";

    if (tokenUser.role === "customer" && phoneFilter.length < 6) {
      return reply.status(400).send({
        success: false,
        message: "phone is required!",
      });
    }
    const useStart = started_date ? 1 : 0;
    const startDate = started_date || "1970-01-01";
    const useEnd = end_date ? 1 : 0;
    const endDate = end_date || "1970-01-01";

    const plan = prisma.raw.sql`
      SELECT
        o.id,
        o.order_number,
        COALESCE(o.name, u.name) AS name,
        COALESCE(o.email, u.email) AS email,
        COALESCE(o.phone, u.phone) AS phone,
        o.total_price,
        o.status,
        COALESCE(o.is_special, false) AS is_special,
        o.pickup_date,
        o.pickup_time,
        o.special_request,
        o."createdAt",
        COUNT(*) OVER()::int AS total_count,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'name', m.food_name,
                'quantity', oi.quantity,
                'image', (
                  SELECT (array_agg(i.image ORDER BY i."createdAt" ASC))[1]
                  FROM menu_image i
                  WHERE i.menu_id = m.id
                )
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
            COALESCE(o.name, u.name, '') || ' ' ||
            COALESCE(o.email, u.email, '') || ' ' ||
            COALESCE(o.phone, u.phone, '') || ' ' ||
            regexp_replace(COALESCE(o.phone, u.phone, ''), '[^0-9]', '', 'g') || ' ' ||
            COALESCE(o.status, '') || ' ' ||
            COALESCE(o.special_request, '') || ' ' ||
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
            AND regexp_replace(COALESCE(o.phone, u.phone, ''), '[^0-9]', '', 'g')
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
        AND (
          ${emailFilter} = ''
          OR lower(COALESCE(o.email, u.email, '')) = lower(${emailFilter})
        )
        AND (
          ${phoneFilter} = ''
          OR regexp_replace(COALESCE(o.phone, u.phone, ''), '[^0-9]', '', 'g') = ${phoneFilter}
          OR (
            length(${phoneFilter}) >= 9
            AND length(regexp_replace(COALESCE(o.phone, u.phone, ''), '[^0-9]', '', 'g')) >= 9
            AND right(regexp_replace(COALESCE(o.phone, u.phone, ''), '[^0-9]', '', 'g'), 9)
              = right(${phoneFilter}, 9)
          )
        )
        AND (
          ${orderNumberFilter} = ''
          OR o.order_number = ${orderNumberFilter}
        )
        AND (
          ${pinnedId} = ''
          OR o.id = ${pinnedId}
        )
        AND (
          ${useStart} = 0
          OR (o."createdAt" AT TIME ZONE 'Europe/Paris')::date >= ${startDate}::date
        )
        AND (
          ${useEnd} = 0
          OR (o."createdAt" AT TIME ZONE 'Europe/Paris')::date <= ${endDate}::date
        )
        AND (
          ${cursorId} = ''
          OR NOT EXISTS (SELECT 1 FROM "order" c WHERE c.id = ${cursorId})
          OR (o."createdAt", o.id) < (
            SELECT c."createdAt", c.id FROM "order" c WHERE c.id = ${cursorId}
          )
        )
      ORDER BY
        o."createdAt" DESC,
        o.id DESC
      LIMIT ${take + 1}
      OFFSET ${offset}
    `
      .returnsRow({
        id: "pg/text@1",
        order_number: { codecId: "pg/text@1", nullable: true },
        name: { codecId: "pg/text@1", nullable: true },
        email: { codecId: "pg/text@1", nullable: true },
        phone: { codecId: "pg/text@1", nullable: true },
        total_price: { codecId: "pg/float8@1", nullable: true },
        status: { codecId: "pg/text@1", nullable: true },
        is_special: "pg/bool@1",
        pickup_date: { codecId: "pg/text@1", nullable: true },
        pickup_time: { codecId: "pg/text@1", nullable: true },
        special_request: { codecId: "pg/text@1", nullable: true },
        createdAt: "pg/timestamptz-string@1",
        total_count: "pg/int4@1",
        order: "pg/json@1",
      })
      .build();

    const result = await prisma.runtime().query(plan);
    const list = Array.isArray(result) ? result : [];
    const hasMore = list.length > take;
    // An empty page has no rows to carry the window count, so total is 0 there.
    const total = Number(list[0]?.total_count ?? 0);
    const rows = (hasMore ? list.slice(0, take) : list).map(
      ({ total_count, ...row }) => row,
    );

    return reply.status(200).send({
      success: true,
      data: rows,
      pagination: {
        hasMore,
        page: pageNumber || 1,
        limit: take,
        total,
        totalPages: Math.max(1, Math.ceil(total / take)),
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

export const getOrderStatus = async (request, reply) => {
  try {
    const { id, order_number } = request.query;
    const orderId = id || "";
    const orderNumber = order_number || "";

    if (!orderId && !orderNumber) {
      return reply.status(400).send({
        success: false,
        message: "id or order_number is required!",
      });
    }

    const plan = prisma.raw.sql`
      SELECT o.status
      FROM "order" o
      WHERE
        (${orderNumber} <> '' AND o.order_number = ${orderNumber})
        OR (${orderNumber} = '' AND o.id = ${orderId})
      LIMIT 1
    `
      .returnsRow({
        status: { codecId: "pg/text@1", nullable: true },
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
      status: row.status,
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
    await readySpecialColumns();
    const { id, order_number } = request.query;
    const orderId = id || "";
    const orderNumber = order_number || "";

    if (!orderId && !orderNumber) {
      return reply.status(400).send({
        success: false,
        message: "id or order_number is required!",
      });
    }

    const plan = prisma.raw.sql`
      SELECT
        o.id,
        o.order_number,
        o.total_price,
        o.status,
        COALESCE(o.is_special, false) AS is_special,
        o.pickup_date,
        o.pickup_time,
        o.special_request,
        o."createdAt",
        COALESCE(o.name, u.name) AS customer_name,
        COALESCE(o.email, u.email) AS customer_email,
        COALESCE(o.phone, u.phone) AS customer_phone,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'name', m.food_name,
                'quantity', oi.quantity,
                'image', (
                  SELECT (array_agg(i.image ORDER BY i."createdAt" ASC))[1]
                  FROM menu_image i
                  WHERE i.menu_id = m.id
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
      WHERE
        (${orderNumber} <> '' AND o.order_number = ${orderNumber})
        OR (${orderNumber} = '' AND o.id = ${orderId})
      LIMIT 1
    `
      .returnsRow({
        id: "pg/text@1",
        order_number: { codecId: "pg/text@1", nullable: true },
        total_price: { codecId: "pg/float8@1", nullable: true },
        status: { codecId: "pg/text@1", nullable: true },
        is_special: "pg/bool@1",
        pickup_date: { codecId: "pg/text@1", nullable: true },
        pickup_time: { codecId: "pg/text@1", nullable: true },
        special_request: { codecId: "pg/text@1", nullable: true },
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
        is_special: row.is_special === true,
        pickup_date: row.pickup_date || "",
        pickup_time: row.pickup_time || "",
        special_request: row.special_request || "",
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
      const existing = await db.order.where({ id }).first();
      if (!existing) continue;
      await db.order.where({ id }).update({ status });
    }

    if (status !== "pending") {
      await markObjectNotificationsRead(ids);
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
      await db.order.where({ id }).delete();
    }

    await markObjectNotificationsRead(ids);

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
