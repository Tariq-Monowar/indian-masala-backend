import { FastifyInstance } from "fastify";
import {
  getAllNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  markObjectNotificationsHandled,
  deleteNotificationBulk,
  clearAllNotifications,
} from "./notifications.controllers";
import { verifyUser } from "../../middleware/auth.middleware";

export default async function notificationsRoutes(fastify: FastifyInstance) {
  /*
   * get all notifications
   * {{_baseUrl}}/api/notifications/get
  */
  fastify.get(
    "/get",
    {
      preHandler: [verifyUser("admin")],
    },
    getAllNotifications,
  );

  /*
   * get unread count
   * {{_baseUrl}}/api/notifications/unread-count
  */
  fastify.get(
    "/unread-count",
    {
      preHandler: [verifyUser("admin")],
    },
    getUnreadCount,
  );

  /*
   * mark all unread as read
   * {{_baseUrl}}/api/notifications/read-all
  */
  fastify.patch(
    "/read-all",
    {
      preHandler: [verifyUser("admin")],
    },
    markAllNotificationsRead,
  );

  /*
   * mark one notification as read
   * {{_baseUrl}}/api/notifications/read/:id
  */
  fastify.patch(
    "/read-object",
    {
      preHandler: [verifyUser("admin")],
    },
    markObjectNotificationsHandled,
  );

  fastify.patch(
    "/read/:id",
    {
      preHandler: [verifyUser("admin")],
    },
    markNotificationRead,
  );

  /*
   * clear all notifications
   * {{_baseUrl}}/api/notifications/clear
  */
  fastify.delete(
    "/clear",
    {
      preHandler: [verifyUser("admin")],
    },
    clearAllNotifications,
  );

  /*
   * delete notification bulk
   * {{_baseUrl}}/api/notifications/bulk
  */
  fastify.delete(
    "/bulk",
    {
      preHandler: [verifyUser("admin")],
    },
    deleteNotificationBulk,
  );
}
