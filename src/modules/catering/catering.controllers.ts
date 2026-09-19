import { db, prisma } from "../../../prisma/db";
import { notify } from "../../notifications";

export const createCatering = async (request, reply) => {
  try {
    const {
      name,
      phone,
      email,
      event_type,
      number_of_guests,
      date,
      location,
      special_requirements,
      description,
      status,
    } = request.body;

    if (!name) {
      return reply.status(400).send({
        success: false,
        message: "name is required!",
      });
    }

    if (!phone) {
      return reply.status(400).send({
        success: false,
        message: "phone is required!",
      });
    }

    if (!date) {
      return reply.status(400).send({
        success: false,
        message: "date is required!",
      });
    }

    if (!number_of_guests) {
      return reply.status(400).send({
        success: false,
        message: "number_of_guests is required!",
      });
    }

    if (
      status &&
      status !== "pending" &&
      status !== "confirmed" &&
      status !== "cancelled" &&
      status !== "completed"
    ) {
      return reply.status(400).send({
        success: false,
        message: "status must be pending, confirmed, cancelled or completed!",
      });
    }

    const catering = await db.catering.create({
      name,
      phone,
      email,
      event_type,
      number_of_guests: Number(number_of_guests),
      date,
      location,
      special_requirements,
      description,
      status: status || "pending",
    });

    void notify({
      io: request.server.io,
      inApp: {
        message: `${name} requested catering${event_type ? ` for a ${event_type}` : ""} on ${date} for ${number_of_guests} guests.`,
        type: "catering",
        object_id: catering.id,
        role: "admin",
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: catering.id,
        name: catering.name,
        phone: catering.phone,
        email: catering.email,
        event_type: catering.event_type,
        number_of_guests: catering.number_of_guests,
        date: catering.date,
        location: catering.location,
        status: catering.status,
        createdAt: catering.createdAt,
        updatedAt: catering.updatedAt,
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

export const getAllCatering = async (request, reply) => {
  try {
    const { cursor, limit, search, status, started_date, end_date, object_id } =
      request.query;
    const take = Number(limit) > 50 ? 50 : Number(limit) || 20;

    const searchPattern = search
      ? "%" + search.split(" ").join("%") + "%"
      : "";
    const digitSearch = search ? String(search).replace(/\D/g, "") : "";
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
        c.id,
        c.name,
        c.phone,
        c.email,
        c.event_type,
        c.number_of_guests,
        c.date,
        c.location,
        c.status,
        c."createdAt",
        c."updatedAt"
      FROM catering c
      WHERE
        (
          ${searchPattern} = ''
          OR (
            COALESCE(c.id, '') || ' ' ||
            COALESCE(c.name, '') || ' ' ||
            COALESCE(c.phone, '') || ' ' ||
            regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') || ' ' ||
            COALESCE(c.email, '') || ' ' ||
            COALESCE(c.event_type, '') || ' ' ||
            COALESCE(c.location, '') || ' ' ||
            COALESCE(c.status, '') || ' ' ||
            COALESCE(c.description, '') || ' ' ||
            COALESCE(c.special_requirements, '') || ' ' ||
            COALESCE(c.date::text, '') || ' ' ||
            COALESCE(c.number_of_guests::text, '')
          ) ILIKE ${searchPattern}
          OR (
            ${digitPattern} <> ''
            AND regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g')
              LIKE ${digitPattern}
          )
        )
        AND (
          ${statusCsv} = ''
          OR lower(c.status) = ANY(
            SELECT lower(trim(s))
            FROM unnest(string_to_array(${statusCsv}, ',')) AS s
          )
        )
        AND (${useStart} = 0 OR c."createdAt" >= ${startDate}::date)
        AND (${useEnd} = 0 OR c."createdAt" < (${endDate}::date + interval '1 day'))
        AND (
          ${cursorId} = ''
          OR NOT EXISTS (SELECT 1 FROM catering x WHERE x.id = ${cursorId})
          OR (c."createdAt", c.id) < (
            SELECT x."createdAt", x.id FROM catering x WHERE x.id = ${cursorId}
          )
        )
      ORDER BY
        CASE WHEN c.id = ${pinnedId} THEN 0 ELSE 1 END,
        c."createdAt" DESC,
        c.id DESC
      LIMIT ${take + 1}
    `
      .returnsRow({
        id: "pg/text@1",
        name: { codecId: "pg/text@1", nullable: true },
        phone: { codecId: "pg/text@1", nullable: true },
        email: { codecId: "pg/text@1", nullable: true },
        event_type: { codecId: "pg/text@1", nullable: true },
        number_of_guests: { codecId: "pg/int4@1", nullable: true },
        date: { codecId: "pg/date-string@1", nullable: true },
        location: { codecId: "pg/text@1", nullable: true },
        status: { codecId: "pg/text@1", nullable: true },
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

export const getSingleCatering = async (request, reply) => {
  try {
    const { id } = request.params;

    if (!id) {
      return reply.status(400).send({
        success: false,
        message: "id is required!",
      });
    }

    const catering = await db.catering.where({ id }).first();

    if (!catering) {
      return reply.status(404).send({
        success: false,
        message: "Catering not found!",
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        id: catering.id,
        name: catering.name,
        phone: catering.phone,
        email: catering.email,
        event_type: catering.event_type,
        number_of_guests: catering.number_of_guests,
        date: catering.date,
        location: catering.location,
        special_requirements: catering.special_requirements,
        description: catering.description,
        status: catering.status,
        createdAt: catering.createdAt,
        updatedAt: catering.updatedAt,
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

export const updateCateringStatus = async (request, reply) => {
  try {
    const { ids, status } = request.body;

    if (!ids || !ids.length) {
      return reply.status(400).send({
        success: false,
        message: "ids is required!",
      });
    }

    if (!status) {
      return reply.status(400).send({
        success: false,
        message: "status is required!",
      });
    }

    if (
      status !== "pending" &&
      status !== "confirmed" &&
      status !== "cancelled" &&
      status !== "completed"
    ) {
      return reply.status(400).send({
        success: false,
        message: "status must be pending, confirmed, cancelled or completed!",
      });
    }

    for (const id of ids) {
      const existing = await db.catering.where({ id }).first();
      if (!existing) continue;
      await db.catering.where({ id }).update({ status });
    }

    return reply.status(200).send({
      success: true,
      message: "Catering status updated successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteCateringBulk = async (request, reply) => {
  try {
    const { ids } = request.body;

    if (!ids || !ids.length) {
      return reply.status(400).send({
        success: false,
        message: "ids is required!",
      });
    }

    for (const id of ids) {
      await db.catering.where({ id }).delete();
    }

    return reply.status(200).send({
      success: true,
      message: "Caterings deleted successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};
