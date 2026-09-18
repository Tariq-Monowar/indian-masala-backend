import { db } from "../../../prisma/db";

export const sendInApp = async ({
  message,
  user_id,
  object_id,
  type,
  role,
  io,
}) => {
  const row = await db.notification.create({
    message,
    is_read: false,
    user_id: user_id || null,
    object_id,
    type,
  });

  if (io && role) {
    io.to(role).emit("notification", row);
  }

  if (io && user_id) {
    io.to(user_id).emit("notification", row);
  }

  return row;
};
