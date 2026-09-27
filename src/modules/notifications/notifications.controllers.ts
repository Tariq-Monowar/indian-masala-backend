import { db, prisma } from "../../../prisma/db";
import { markObjectNotificationsRead } from "../../notifications/in_app/mark-handled";

export const getAllNotifications = async (request, reply) => {
  try {
    const { cursor, limit } = request.query;
    const { id } = request.user;
    const take = Number(limit) > 50 ? 50 : Number(limit) || 20;
    const cursorId = cursor || "";
    const userId = id || "";

    const plan = prisma.raw.sql`
      SELECT
        n.id,
        n.message,
        n.is_read,
        n.user_id,
        n.object_id,
        n.type,
        n."createdAt"
      FROM notification n
      WHERE
        (n.user_id IS NULL OR n.user_id = ${userId})
        AND (
          ${cursorId} = ''
          OR NOT EXISTS (SELECT 1 FROM notification x WHERE x.id = ${cursorId})
          OR (n."createdAt", n.id) < (
            SELECT x."createdAt", x.id FROM notification x WHERE x.id = ${cursorId}
          )
        )
      ORDER BY n."createdAt" DESC, n.id DESC
      LIMIT ${take + 1}
    `
      .returnsRow({
        id: "pg/text@1",
        message: { codecId: "pg/text@1", nullable: true },
        is_read: "pg/bool@1",
        user_id: { codecId: "pg/text@1", nullable: true },
        object_id: { codecId: "pg/text@1", nullable: true },
        type: { codecId: "pg/text@1", nullable: true },
        createdAt: "pg/timestamptz-string@1",
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

export const getUnreadCount = async (request, reply) => {
  try {
    const plan = prisma.raw.sql`
      SELECT
        (
          SELECT COUNT(*)::int FROM "order"
          WHERE lower(COALESCE(status, '')) = 'pending'
        ) AS new_order,
        (
          SELECT COUNT(*)::int FROM reservation
          WHERE lower(COALESCE(status, '')) = 'pending'
        ) AS reservation,
        (
          SELECT COUNT(*)::int FROM catering
          WHERE lower(COALESCE(status, '')) = 'pending'
        ) AS catering,
        (
          SELECT COUNT(*)::int FROM notification
          WHERE is_read = false
            AND lower(COALESCE(type, '')) IN ('contact_us', 'contact', 'contect_us')
        ) AS contact_us,
        (
          SELECT COUNT(*)::int FROM notification
          WHERE is_read = false
        ) AS unread
    `
      .returnsRow({
        new_order: "pg/int4@1",
        reservation: "pg/int4@1",
        catering: "pg/int4@1",
        contact_us: "pg/int4@1",
        unread: "pg/int4@1",
      })
      .build();

    const result = await prisma.runtime().query(plan);
    const list = Array.isArray(result) ? result : [];
    const row = list[0] || {};

    const contactPlan = prisma.raw.sql`
      SELECT n.object_id
      FROM notification n
      WHERE n.is_read = false
        AND lower(COALESCE(n.type, '')) IN ('contact_us', 'contact', 'contect_us')
        AND n.object_id IS NOT NULL
    `
      .returnsRow({
        object_id: "pg/text@1",
      })
      .build();

    const contactResult = await prisma.runtime().query(contactPlan);
    const contactRows = Array.isArray(contactResult) ? contactResult : [];
    const contactIds = [
      ...new Set(
        contactRows
          .map((item) => String(item?.object_id ?? "").trim())
          .filter(Boolean),
      ),
    ];

    return reply.status(200).send({
      success: true,
      data: {
        count: Number(row.unread || 0),
        byType: {
          new_order: Number(row.new_order || 0),
          reservation: Number(row.reservation || 0),
          catering: Number(row.catering || 0),
          contact_us: Number(row.contact_us || 0),
        },
        contactIds,
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

export const markAllNotificationsRead = async (request, reply) => {
  try {
    const { id } = request.user;
    const userId = id || "";

    const plan = prisma.raw.sql`
      SELECT n.id
      FROM notification n
      WHERE
        (n.user_id IS NULL OR n.user_id = ${userId})
        AND n.is_read = false
    `
      .returnsRow({
        id: "pg/text@1",
      })
      .build();

    const result = await prisma.runtime().query(plan);
    const list = Array.isArray(result) ? result : [];

    for (const row of list) {
      await db.notification.where({ id: row.id }).update({ is_read: true });
    }

    return reply.status(200).send({
      success: true,
      message: "Notifications marked as read successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const markObjectNotificationsHandled = async (request, reply) => {
  try {
    const objectId = String(request.body?.object_id ?? "").trim();
    if (!objectId) {
      return reply.status(400).send({
        success: false,
        message: "object_id is required!",
      });
    }

    await markObjectNotificationsRead([objectId]);

    return reply.status(200).send({
      success: true,
      message: "Notification marked as read successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const markNotificationRead = async (request, reply) => {
  try {
    const { id } = request.params;
    const userId = request.user?.id || "";

    if (!id) {
      return reply.status(400).send({
        success: false,
        message: "id is required!",
      });
    }

    const existing = await db.notification.where({ id }).first();
    if (!existing) {
      return reply.status(404).send({
        success: false,
        message: "Notification not found!",
      });
    }

    const ownerOk =
      existing.user_id == null || existing.user_id === userId;
    if (!ownerOk) {
      return reply.status(404).send({
        success: false,
        message: "Notification not found!",
      });
    }

    if (!existing.is_read) {
      await db.notification.where({ id }).update({ is_read: true });
    }

    return reply.status(200).send({
      success: true,
      message: "Notification marked as read successfully",
      data: { id, is_read: true },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteNotificationBulk = async (request, reply) => {
  try {
    const { ids } = request.body;

    if (!ids || !ids.length) {
      return reply.status(400).send({
        success: false,
        message: "ids is required!",
      });
    }

    for (const id of ids) {
      await db.notification.where({ id }).delete();
    }

    return reply.status(200).send({
      success: true,
      message: "Notifications deleted successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const clearAllNotifications = async (request, reply) => {
  try {
    const { id } = request.user;
    const userId = id || "";

    const plan = prisma.raw.sql`
      SELECT n.id
      FROM notification n
      WHERE n.user_id IS NULL OR n.user_id = ${userId}
    `
      .returnsRow({
        id: "pg/text@1",
      })
      .build();

    const result = await prisma.runtime().query(plan);
    const list = Array.isArray(result) ? result : [];

    for (const row of list) {
      await db.notification.where({ id: row.id }).delete();
    }

    return reply.status(200).send({
      success: true,
      message: "All notifications cleared successfully",
      data: { deleted: list.length },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};
