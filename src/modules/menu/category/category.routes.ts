import { FastifyInstance } from "fastify";
import {
  createCategory,
  getAllCategory,
  updateCategory,
  reorderCategories,
  deleteCategoryBulk,
} from "./category.controllers";

export default async function categoryRoutes(fastify: FastifyInstance) {
  /*
   * create category
   * {{_baseUrl}}/api/menu/category/create
  */
  fastify.post("/create", createCategory);

  /*
   * get all category
   * {{_baseUrl}}/api/menu/category/get
  */
  fastify.get("/get", getAllCategory);

  /*
   * update category
   * {{_baseUrl}}/api/menu/category/update/:id
  */
  fastify.patch("/update/:id", updateCategory);

  /*
   * reorder categories
   * {{_baseUrl}}/api/menu/category/reorder
  */
  fastify.patch("/reorder", reorderCategories);

  /*
   * delete category bulk
   * {{_baseUrl}}/api/menu/category/bulk
  */
  fastify.delete("/bulk", deleteCategoryBulk);
}
