import { FastifyInstance } from "fastify";
import category from "./category/category.routes";
import {
  createMenu,
  getAllMenu,
  getSingleMenu,
  updateMenu,
  deleteMenuBulk,
  deleteImageBulk,
} from "./menu.controllers";
import { upload } from "../../config/storage.config";
import { verifyUser } from "../../middleware/auth.middleware";

export default async function menuRoutes(fastify: FastifyInstance) {
  /*
   * categories operations
   * {{_baseUrl}}/api/menu/category
  */
  fastify.register(category, { prefix: "/category" });

  /*
   * create menu
   * {{_baseUrl}}/api/menu/create
  */
  fastify.post(
    "/create",
    {
      preHandler: [verifyUser("admin"), upload.array("images", 10)],
    },
    createMenu,
  );

  /*
   * get all menu
   * {{_baseUrl}}/api/menu/get
  */
  fastify.get("/get", getAllMenu);

  /*
   * get single menu
   * {{_baseUrl}}/api/menu/get/:id
  */
  fastify.get("/get/:id", getSingleMenu);

  /*
   * update menu
   * {{_baseUrl}}/api/menu/update/:id
  */
  fastify.patch(
    "/update/:id",
    {
      preHandler: [verifyUser("admin"), upload.array("images", 10)],
    },
    updateMenu,
  );

  /*
   * delete menu bulk
   * {{_baseUrl}}/api/menu/bulk
  */
  fastify.delete(
    "/bulk",
    {
      preHandler: [verifyUser("admin")],
    },
    deleteMenuBulk,
  );

  /*
   * delete image bulk
   * {{_baseUrl}}/api/menu/image
  */
  fastify.delete(
    "/image",
    {
      preHandler: [verifyUser("admin")],
    },
    deleteImageBulk,
  );
}
