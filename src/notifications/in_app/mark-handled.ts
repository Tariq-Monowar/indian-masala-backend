import { db } from "../../../prisma/db";

export async function markObjectNotificationsRead(objectIds) {
  const ids = [
    ...new Set(
      (Array.isArray(objectIds) ? objectIds : [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean),
    ),
  ];

  for (const object_id of ids) {
    const rows = await db.notification
      .where({ object_id, is_read: false })
      .all();
    for (const row of rows) {
      await db.notification.where({ id: row.id }).update({ is_read: true });
    }
  }
}
