import { db, prisma } from "../../../prisma/db";

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
    const rows = await db.notification.where({ is_read: false }).all();

    return reply.status(200).send({
      success: true,
      data: { count: rows.length },
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
