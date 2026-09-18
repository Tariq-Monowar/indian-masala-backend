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
    user_id,
    object_id,
    type,
  });

  if (io) {
    if (user_id) io.to(user_id).emit("notification", row);
    if (role) io.to(role).emit("notification", row);
  }

  return row;
};
