import { db } from "../../../../prisma/db";

export const createCategory = async (request, reply) => {
  try {
    const { name, icon } = request.body;

    if (!name) {
      return reply.status(400).send({
        success: false,
        message: "name is required!",
      });
    }

    const category = await db.category.create({
      name,
      icon,
    });

    return reply.status(201).send({
      success: true,
      data: category,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getAllCategory = async (request, reply) => {
  try {
    const { cursor, limit, search } = request.query;
    const take = Number(limit) || 20;

    let query = db.category
      .select("id", "name", "icon", "createdAt")
      .orderBy((category) => category.id.asc());

    if (search) {
      query = query.where((category) => category.name.ilike("%" + search + "%"));
    }

    if (cursor) {
      query = query.cursor({ id: cursor });
    }

    let rows = await query.limit(take + 1).all();
    const hasMore = rows.length > take;
    if (hasMore) {
      rows = rows.slice(0, take);
    }

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

export const updateCategory = async (request, reply) => {
  try {
    const { id } = request.params;
    const { name, icon } = request.body;

    if (!id) {
      return reply.status(400).send({
        success: false,
        message: "id is required!",
      });
    }

    const existing = await db.category.where({ id }).first();

    if (!existing) {
      return reply.status(404).send({
        success: false,
        message: "Category not found!",
      });
    }

    const category = await db.category.where({ id }).update({
      name,
      icon,
    });

    return reply.status(200).send({
      success: true,
      data: category,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteCategoryBulk = async (request, reply) => {
  try {
    const { ids } = request.body;

    if (!ids || !ids.length) {
      return reply.status(400).send({
        success: false,
        message: "ids is required!",
      });
    }

    for (const id of ids) {
      await db.category.where({ id }).delete();
    }

    return reply.status(200).send({
      success: true,
      message: "Categories deleted successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};
