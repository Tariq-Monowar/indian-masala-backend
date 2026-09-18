import { db, prisma } from "../../../prisma/db";
import { notify } from "../../notifications";

export const createReservation = async (request, reply) => {
  try {
    const {
      number_of_guests,
      date,
      time,
      name,
      phone,
      email,
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

    if (!time) {
      return reply.status(400).send({
        success: false,
        message: "time is required!",
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

    const reservation = await db.reservation.create({
      number_of_guests: Number(number_of_guests),
      date,
      time,
      name,
      phone,
      email,
      description,
      status: status || "pending",
    });

    void notify({
      io: request.server.io,
      inApp: {
        message: `${name} booked a table for ${number_of_guests} guests on ${date} at ${time}.`,
        type: "reservation",
        object_id: reservation.id,
        role: "admin",
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: reservation.id,
        number_of_guests: reservation.number_of_guests,
        date: reservation.date,
        time: reservation.time,
        name: reservation.name,
        phone: reservation.phone,
        email: reservation.email,
        status: reservation.status,
        createdAt: reservation.createdAt,
        updatedAt: reservation.updatedAt,
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

export const getAllReservation = async (request, reply) => {
  try {
    const { cursor, limit, search, status, started_date, end_date } =
      request.query;
    const take = Number(limit) > 50 ? 50 : Number(limit) || 20;

    const searchPattern = search
      ? "%" + search.split(" ").join("%") + "%"
      : "";
    const statusCsv = status || "";
    const cursorId = cursor || "";
    const useStart = started_date ? 1 : 0;
    const startDate = started_date || "1970-01-01";
    const useEnd = end_date ? 1 : 0;
    const endDate = end_date || "1970-01-01";

    const plan = prisma.raw.sql`
      SELECT
        r.id,
        r.number_of_guests,
        r.date,
        r.time,
        r.name,
        r.phone,
        r.email,
        r.status,
        r."createdAt",
        r."updatedAt"
      FROM reservation r
      WHERE
        (
          ${searchPattern} = ''
          OR (
            COALESCE(r.name, '') || ' ' ||
            COALESCE(r.phone, '') || ' ' ||
            COALESCE(r.email, '') || ' ' ||
            COALESCE(r.status, '') || ' ' ||
            COALESCE(r.date::text, '') || ' ' ||
            COALESCE(r.time::text, '') || ' ' ||
            COALESCE(r.number_of_guests::text, '')
          ) ILIKE ${searchPattern}
        )
        AND (
          ${statusCsv} = ''
          OR r.status = ANY(string_to_array(${statusCsv}, ','))
        )
        AND (${useStart} = 0 OR r."createdAt" >= ${startDate}::date)
        AND (${useEnd} = 0 OR r."createdAt" < (${endDate}::date + interval '1 day'))
        AND (
          ${cursorId} = ''
          OR NOT EXISTS (SELECT 1 FROM reservation c WHERE c.id = ${cursorId})
          OR (r."createdAt", r.id) < (
            SELECT c."createdAt", c.id FROM reservation c WHERE c.id = ${cursorId}
          )
        )
      ORDER BY r."createdAt" DESC, r.id DESC
      LIMIT ${take + 1}
    `
      .returnsRow({
        id: "pg/text@1",
        number_of_guests: { codecId: "pg/int4@1", nullable: true },
        date: { codecId: "pg/date-string@1", nullable: true },
        time: { codecId: "pg/time-string@1", nullable: true },
        name: { codecId: "pg/text@1", nullable: true },
        phone: { codecId: "pg/text@1", nullable: true },
        email: { codecId: "pg/text@1", nullable: true },
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

export const getSingleReservation = async (request, reply) => {
  try {
    const { id } = request.params;

    if (!id) {
      return reply.status(400).send({
        success: false,
        message: "id is required!",
      });
    }

    const reservation = await db.reservation.where({ id }).first();

    if (!reservation) {
      return reply.status(404).send({
        success: false,
        message: "Reservation not found!",
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        id: reservation.id,
        number_of_guests: reservation.number_of_guests,
        date: reservation.date,
        time: reservation.time,
        name: reservation.name,
        phone: reservation.phone,
        email: reservation.email,
        description: reservation.description,
        status: reservation.status,
        createdAt: reservation.createdAt,
        updatedAt: reservation.updatedAt,
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

export const updateReservationStatus = async (request, reply) => {
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
      const existing = await db.reservation.where({ id }).first();
      if (!existing) continue;
      await db.reservation.where({ id }).update({ status });
    }

    return reply.status(200).send({
      success: true,
      message: "Reservation status updated successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteReservationBulk = async (request, reply) => {
  try {
    const { ids } = request.body;

    if (!ids || !ids.length) {
      return reply.status(400).send({
        success: false,
        message: "ids is required!",
      });
    }

    for (const id of ids) {
      await db.reservation.where({ id }).delete();
    }

    return reply.status(200).send({
      success: true,
      message: "Reservations deleted successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};
