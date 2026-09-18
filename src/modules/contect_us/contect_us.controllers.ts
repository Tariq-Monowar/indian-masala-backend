import { db, prisma } from "../../../prisma/db";
import { notify } from "../../notifications";

export const createContectUs = async (request, reply) => {
  try {
    const { first_name, last_name, email, phone, message } = request.body;

    if (!first_name) {
      return reply.status(400).send({
        success: false,
        message: "first_name is required!",
      });
    }

    if (!email) {
      return reply.status(400).send({
        success: false,
        message: "email is required!",
      });
    }

    if (!message) {
      return reply.status(400).send({
        success: false,
        message: "message is required!",
      });
    }

    const contect = await db.contect_us.create({
      first_name,
      last_name,
      email,
      phone,
      message,
    });

    const fullName = last_name ? `${first_name} ${last_name}` : first_name;
    const shortMessage =
      message.length > 80 ? `${message.slice(0, 80)}…` : message;

    void notify({
      io: request.server.io,
      inApp: {
        message: `${fullName} sent a message${phone ? ` (${phone})` : ""}: "${shortMessage}"`,
        type: "contact_us",
        object_id: contect.id,
        role: "admin",
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: contect.id,
        first_name: contect.first_name,
        last_name: contect.last_name,
        email: contect.email,
        phone: contect.phone,
        createdAt: contect.createdAt,
        updatedAt: contect.updatedAt,
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

export const getAllContectUs = async (request, reply) => {
  try {
    const { cursor, limit, started_date, end_date } = request.query;
    const take = Number(limit) > 50 ? 50 : Number(limit) || 20;

    const cursorId = cursor || "";
    const useStart = started_date ? 1 : 0;
    const startDate = started_date || "1970-01-01";
    const useEnd = end_date ? 1 : 0;
    const endDate = end_date || "1970-01-01";

    const plan = prisma.raw.sql`
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        c.message,
        c."createdAt",
        c."updatedAt"
      FROM contect_us c
      WHERE
        (${useStart} = 0 OR c."createdAt" >= ${startDate}::date)
        AND (${useEnd} = 0 OR c."createdAt" < (${endDate}::date + interval '1 day'))
        AND (
          ${cursorId} = ''
          OR NOT EXISTS (SELECT 1 FROM contect_us x WHERE x.id = ${cursorId})
          OR (c."createdAt", c.id) < (
            SELECT x."createdAt", x.id FROM contect_us x WHERE x.id = ${cursorId}
          )
        )
      ORDER BY c."createdAt" DESC, c.id DESC
      LIMIT ${take + 1}
    `
      .returnsRow({
        id: "pg/text@1",
        first_name: { codecId: "pg/text@1", nullable: true },
        last_name: { codecId: "pg/text@1", nullable: true },
        email: { codecId: "pg/text@1", nullable: true },
        phone: { codecId: "pg/text@1", nullable: true },
        message: { codecId: "pg/text@1", nullable: true },
        createdAt: "pg/timestamptz-string@1",
        updatedAt: "pg/timestamptz-string@1",
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

export const deleteContectUsBulk = async (request, reply) => {
  try {
    const { ids } = request.body;

    if (!ids || !ids.length) {
      return reply.status(400).send({
        success: false,
        message: "ids is required!",
      });
    }

    for (const id of ids) {
      await db.contect_us.where({ id }).delete();
    }

    return reply.status(200).send({
      success: true,
      message: "Contect us deleted successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};
