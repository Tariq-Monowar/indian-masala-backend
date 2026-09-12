import { db, prisma } from "../../../prisma/db";
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
    const {
      cursor,
      limit,
      search,
      category,
      spicy_level,
      min_price,
      max_price,
      price,
      preparation_time,
      sort,
      sort_by,
    } = request.query;
    const take = Number(limit) > 50 ? 50 : Number(limit) || 20;

    const searchPattern = search
      ? "%" + search.split(" ").join("%") + "%"
      : "";

    let categoryNameCsv = "";
    let categoryIdCsv = "";
    if (category) {
      const names = [""].slice(0, 0);
      const ids = [""].slice(0, 0);
      for (const item of category.split(",")) {
        const value = item.trim();
        if (!value) continue;
        if (value.length === 36) {
          ids.push(value);
        } else {
          names.push("%" + value + "%");
        }
      }
      categoryNameCsv = names.join("|||");
      categoryIdCsv = ids.join(",");
    }

    const spicyCsv = spicy_level
      ? spicy_level
          .split(",")
          .map((level) => level.trim().toLowerCase())
          .join(",")
      : "";

    const minParts = min_price ? min_price.split(",") : [];
    const maxParts = max_price ? max_price.split(",") : [];
    const priceParts = price ? price.split(",") : [];
    let priceFrom = 0;
    let priceTo = 0;
    let usePrice = 0;
    if (price || min_price || max_price) {
      if (priceParts[0] && priceParts[1]) {
        priceFrom = Number(priceParts[0]);
        priceTo = Number(priceParts[1]);
      } else if (minParts[0] && maxParts[0] && !minParts[1] && !maxParts[1]) {
        priceFrom = Number(minParts[0]);
        priceTo = Number(maxParts[0]);
      } else if (maxParts[0] && maxParts[1]) {
        priceFrom = Number(maxParts[0]);
        priceTo = Number(maxParts[1]);
      } else if (minParts[0] && minParts[1]) {
        priceFrom = Number(minParts[0]);
        priceTo = Number(minParts[1]);
      } else if (priceParts[0]) {
        priceFrom = 0;
        priceTo = Number(priceParts[0]);
      }
      if (!Number.isNaN(priceFrom) && !Number.isNaN(priceTo)) {
        usePrice = 1;
      }
    }

    const prepFrom = preparation_time
      ? Number(preparation_time.split(",")[0])
      : 0;
    const usePrepFrom =
      preparation_time && !Number.isNaN(prepFrom) ? 1 : 0;
    const prepTo =
      preparation_time && preparation_time.split(",")[1]
        ? Number(preparation_time.split(",")[1])
        : 0;
    const usePrepTo =
      preparation_time &&
      preparation_time.split(",")[1] &&
      !Number.isNaN(prepTo)
        ? 1
        : 0;

    let sortKey = "createdAt_desc";
    if (sort_by === "min_price" || sort_by === "price") {
      sortKey = sort === "asc" ? "min_price_asc" : "min_price_desc";
    } else if (sort_by === "max_price") {
      sortKey = sort === "asc" ? "max_price_asc" : "max_price_desc";
    } else if (sort_by === "preparation_time") {
      sortKey = sort === "asc" ? "preparation_time_asc" : "preparation_time_desc";
    } else if (sort === "asc") {
      sortKey = "createdAt_asc";
    }

    const cursorId = cursor || "";

    const plan = prisma.raw.sql`
      SELECT
        m.id,
        m.food_name,
        m.category_id,
        m.category_name,
        m.icon,
        m.min_price,
        m.max_price,
        m.preparation_time,
        m.spicy_level,
        m.description_en,
        m.description_fr,
        m."createdAt",
        COALESCE(
          (
            SELECT json_agg(json_build_object('id', i.id, 'image', i.image) ORDER BY i."createdAt" ASC)
            FROM menu_image i
            WHERE i.menu_id = m.id
          ),
          '[]'::json
        ) AS images
      FROM menu m
      WHERE
        (
          ${searchPattern} = ''
          OR (
            COALESCE(m.food_name, '') || ' ' ||
            COALESCE(m.category_name, '') || ' ' ||
            COALESCE(m.description_en, '') || ' ' ||
            COALESCE(m.description_fr, '')
          ) ILIKE ${searchPattern}
        )
        AND (
          (${categoryNameCsv} = '' AND ${categoryIdCsv} = '')
          OR (
            (${categoryNameCsv} <> '' AND m.category_name ILIKE ANY(string_to_array(${categoryNameCsv}, '|||')))
            OR (${categoryIdCsv} <> '' AND m.category_id = ANY(string_to_array(${categoryIdCsv}, ',')))
          )
        )
        AND (
          ${spicyCsv} = ''
          OR lower(m.spicy_level) = ANY(string_to_array(${spicyCsv}, ','))
        )
        AND (
          ${usePrice} = 0
          OR (
            COALESCE(m.min_price, m.max_price) <= ${priceTo}
            AND COALESCE(m.max_price, m.min_price) >= ${priceFrom}
          )
        )
        AND (${usePrepFrom} = 0 OR m.preparation_time >= ${prepFrom})
        AND (${usePrepTo} = 0 OR m.preparation_time <= ${prepTo})
        AND (
          ${cursorId} = ''
          OR NOT EXISTS (SELECT 1 FROM menu c WHERE c.id = ${cursorId})
          OR (
            ${sortKey} = 'createdAt_desc'
            AND (m."createdAt", m.id) < (SELECT c."createdAt", c.id FROM menu c WHERE c.id = ${cursorId})
          )
          OR (
            ${sortKey} = 'createdAt_asc'
            AND (m."createdAt", m.id) > (SELECT c."createdAt", c.id FROM menu c WHERE c.id = ${cursorId})
          )
          OR (
            ${sortKey} = 'min_price_desc'
            AND (m.min_price, m.id) < (SELECT c.min_price, c.id FROM menu c WHERE c.id = ${cursorId})
          )
          OR (
            ${sortKey} = 'min_price_asc'
            AND (m.min_price, m.id) > (SELECT c.min_price, c.id FROM menu c WHERE c.id = ${cursorId})
          )
          OR (
            ${sortKey} = 'max_price_desc'
            AND (m.max_price, m.id) < (SELECT c.max_price, c.id FROM menu c WHERE c.id = ${cursorId})
          )
          OR (
            ${sortKey} = 'max_price_asc'
            AND (m.max_price, m.id) > (SELECT c.max_price, c.id FROM menu c WHERE c.id = ${cursorId})
          )
          OR (
            ${sortKey} = 'preparation_time_desc'
            AND (m.preparation_time, m.id) < (SELECT c.preparation_time, c.id FROM menu c WHERE c.id = ${cursorId})
          )
          OR (
            ${sortKey} = 'preparation_time_asc'
            AND (m.preparation_time, m.id) > (SELECT c.preparation_time, c.id FROM menu c WHERE c.id = ${cursorId})
          )
        )
      ORDER BY
        CASE WHEN ${sortKey} = 'min_price_asc' THEN m.min_price END ASC NULLS LAST,
        CASE WHEN ${sortKey} = 'min_price_desc' THEN m.min_price END DESC NULLS LAST,
        CASE WHEN ${sortKey} = 'max_price_asc' THEN m.max_price END ASC NULLS LAST,
        CASE WHEN ${sortKey} = 'max_price_desc' THEN m.max_price END DESC NULLS LAST,
        CASE WHEN ${sortKey} = 'preparation_time_asc' THEN m.preparation_time END ASC NULLS LAST,
        CASE WHEN ${sortKey} = 'preparation_time_desc' THEN m.preparation_time END DESC NULLS LAST,
        CASE WHEN ${sortKey} = 'createdAt_asc' THEN m."createdAt" END ASC,
        CASE WHEN ${sortKey} = 'createdAt_desc' THEN m."createdAt" END DESC,
        m.id DESC
      LIMIT ${take + 1}
    `
      .returnsRow({
        id: "pg/text@1",
        food_name: { codecId: "pg/text@1", nullable: true },
        category_id: { codecId: "pg/text@1", nullable: true },
        category_name: { codecId: "pg/text@1", nullable: true },
        icon: { codecId: "pg/text@1", nullable: true },
        min_price: { codecId: "pg/float8@1", nullable: true },
        max_price: { codecId: "pg/float8@1", nullable: true },
        preparation_time: { codecId: "pg/int4@1", nullable: true },
        spicy_level: { codecId: "pg/text@1", nullable: true },
        description_en: { codecId: "pg/text@1", nullable: true },
        description_fr: { codecId: "pg/text@1", nullable: true },
        createdAt: "pg/timestamptz-string@1",
        images: "pg/json@1",
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
