import { db } from "../../../prisma/db";
import { FileService } from "../../config/storage.config";

export const createMenu = async (request, reply) => {
  try {
    const {
      food_name,
      category_id,
      min_price,
      max_price,
      preparation_time,
      spicy_level,
      description_en,
      description_fr,
    } = request.body;

    let category_name;
    let icon;
    if (category_id) {
      const category = await db.category.where({ id: category_id }).first();
      if (!category) {
        FileService.removeFiles(request.files);
        return reply.status(400).send({
          success: false,
          message: "Category not found!",
        });
      }
      category_name = category.name;
      icon = category.icon;
    }

    const menu = await db.menu.create({
      food_name,
      category_id,
      category_name,
      icon,
      min_price: min_price ? Number(min_price) : null,
      max_price: max_price ? Number(max_price) : null,
      preparation_time: preparation_time ? Number(preparation_time) : null,
      spicy_level,
      description_en,
      description_fr,
    });

    if (request.files) {
      for (const file of request.files) {
        await db.menu_image.create({
          menu_id: menu.id,
          image: file.filename,
        });
      }
    }

    const images = await db.menu_image
      .select("id", "image")
      .where({ menu_id: menu.id })
      .all();

    return reply.status(201).send({
      success: true,
      data: {
        ...menu,
        images,
      },
    });
  } catch (error) {
    FileService.removeFiles(request.files);
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getAllMenu = async (request, reply) => {
  try {
    const { cursor, limit, search, category } = request.query;
    const take = Number(limit) || 20;

    let query = db.menu
      .select(
        "id",
        "food_name",
        "category_id",
        "category_name",
        "icon",
        "min_price",
        "max_price",
        "preparation_time",
        "spicy_level",
        "description_en",
        "description_fr",
        "createdAt",
      )
      .include("menu_image", (image) => image.select("id", "image"))
      .orderBy((menu) => menu.id.asc());

    if (search) {
      query = query.where((menu) => menu.food_name.ilike("%" + search + "%"));
    }

    if (category) {
      query = query.where((menu) =>
        menu.category_name.ilike("%" + category + "%"),
      );
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
      data: rows.map((row) => ({
        id: row.id,
        food_name: row.food_name,
        category_id: row.category_id,
        category_name: row.category_name,
        icon: row.icon,
        min_price: row.min_price,
        max_price: row.max_price,
        preparation_time: row.preparation_time,
        spicy_level: row.spicy_level,
        description_en: row.description_en,
        description_fr: row.description_fr,
        createdAt: row.createdAt,
        images: row.menu_image,
      })),
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

export const getSingleMenu = async (request, reply) => {
  try {
    const { id } = request.params;

    if (!id) {
      return reply.status(400).send({
        success: false,
        message: "id is required!",
      });
    }

    const menu = await db.menu
      .where({ id })
      .include("menu_image", (image) => image.select("id", "image"))
      .first();

    if (!menu) {
      return reply.status(404).send({
        success: false,
        message: "Menu not found!",
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        id: menu.id,
        food_name: menu.food_name,
        category_id: menu.category_id,
        category_name: menu.category_name,
        icon: menu.icon,
        min_price: menu.min_price,
        max_price: menu.max_price,
        preparation_time: menu.preparation_time,
        spicy_level: menu.spicy_level,
        description_en: menu.description_en,
        description_fr: menu.description_fr,
        createdAt: menu.createdAt,
        updatedAt: menu.updatedAt,
        images: menu.menu_image,
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

export const updateMenu = async (request, reply) => {
  try {
    const { id } = request.params;
    const {
      food_name,
      category_id,
      min_price,
      max_price,
      preparation_time,
      spicy_level,
      description_en,
      description_fr,
    } = request.body;

    if (!id) {
      return reply.status(400).send({
        success: false,
        message: "id is required!",
      });
    }

    const existing = await db.menu.where({ id }).first();
    if (!existing) {
      FileService.removeFiles(request.files);
      return reply.status(404).send({
        success: false,
        message: "Menu not found!",
      });
    }

    let category_name = existing.category_name;
    let icon = existing.icon;
    if (category_id) {
      const category = await db.category.where({ id: category_id }).first();
      if (!category) {
        FileService.removeFiles(request.files);
        return reply.status(400).send({
          success: false,
          message: "Category not found!",
        });
      }
      category_name = category.name;
      icon = category.icon;
    }

    const menu = await db.menu.where({ id }).update({
      food_name: food_name ?? existing.food_name,
      category_id: category_id ?? existing.category_id,
      category_name,
      icon,
      min_price: min_price ? Number(min_price) : existing.min_price,
      max_price: max_price ? Number(max_price) : existing.max_price,
      preparation_time: preparation_time
        ? Number(preparation_time)
        : existing.preparation_time,
      spicy_level: spicy_level ?? existing.spicy_level,
      description_en: description_en ?? existing.description_en,
      description_fr: description_fr ?? existing.description_fr,
    });

    if (!menu) {
      FileService.removeFiles(request.files);
      return reply.status(404).send({
        success: false,
        message: "Menu not found!",
      });
    }

    if (request.files) {
      for (const file of request.files) {
        await db.menu_image.create({
          menu_id: id,
          image: file.filename,
        });
      }
    }

    const images = await db.menu_image
      .select("id", "image")
      .where({ menu_id: id })
      .all();

    return reply.status(200).send({
      success: true,
      data: {
        ...menu,
        images,
      },
    });
  } catch (error) {
    FileService.removeFiles(request.files);
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteMenuBulk = async (request, reply) => {
  try {
    const { ids } = request.body;

    if (!ids || !ids.length) {
      return reply.status(400).send({
        success: false,
        message: "ids is required!",
      });
    }

    for (const id of ids) {
      const imageRows = await db.menu_image.where({ menu_id: id }).all();
      for (const row of imageRows) {
        FileService.removeFile(row.image);
      }
      await db.menu.where({ id }).delete();
    }

    return reply.status(200).send({
      success: true,
      message: "Menus deleted successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteImageBulk = async (request, reply) => {
  try {
    const { ids } = request.body;

    if (!ids || !ids.length) {
      return reply.status(400).send({
        success: false,
        message: "ids is required!",
      });
    }

    for (const id of ids) {
      const row = await db.menu_image.where({ id }).first();
      if (!row) continue;
      FileService.removeFile(row.image);
      await db.menu_image.where({ id }).delete();
    }

    return reply.status(200).send({
      success: true,
      message: "Images deleted successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};
