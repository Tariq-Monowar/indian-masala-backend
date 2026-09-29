import { db, prisma } from "../../../prisma/db";
import { FileService } from "../../config/storage.config";
import { mapUploadImages } from "../../utils/upload-url";

function readPrice(value) {
  if (value === undefined || value === null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function resolveStoredPrices(min_price, max_price, existing = null) {
  const incomingMin = readPrice(min_price);
  const incomingMax = readPrice(max_price);
  const price =
    incomingMin ??
    incomingMax ??
    (existing ? (existing.min_price ?? existing.max_price) : null);
  return { min_price: price, max_price: price };
}

export const createMenu = async (request, reply) => {
  try {
    const {
      food_name,
      category_id,
      min_price,
      max_price,
      preparation_time,
      spicy_level,
      is_favorite,
      is_bestseller,
      is_available,
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
      category_name = category.name_en || category.name || category.name_fr || null;
      icon = category.icon;
    }

    const prices = resolveStoredPrices(min_price, max_price);

    const menu = await db.menu.create({
      food_name,
      category_id,
      category_name,
      icon,
      min_price: prices.min_price,
      max_price: prices.max_price,
      preparation_time: preparation_time ? Number(preparation_time) : null,
      spicy_level,
      is_favorite:
        is_favorite === true ||
        is_favorite === 1 ||
        is_favorite === "1" ||
        is_favorite === "true" ||
        is_favorite === "yes",
      is_bestseller:
        is_bestseller === true ||
        is_bestseller === 1 ||
        is_bestseller === "1" ||
        is_bestseller === "true" ||
        is_bestseller === "yes",
      is_available:
        is_available === undefined ||
        is_available === null ||
        is_available === ""
          ? true
          : is_available === true ||
            is_available === 1 ||
            is_available === "1" ||
            is_available === "true" ||
            is_available === "yes",
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

    const imageRows = await db.menu_image
      .select("id", "image")
      .where({ menu_id: menu.id })
      .all();
    const images = mapUploadImages(imageRows, request);

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
      is_favorite,
      is_bestseller,
      is_available,
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

    const hasFavoriteFilter =
      is_favorite !== undefined &&
      is_favorite !== null &&
      String(is_favorite).trim() !== "";
    const useFavorite = hasFavoriteFilter ? 1 : 0;
    const favoriteValue =
      hasFavoriteFilter &&
      (is_favorite === true ||
        is_favorite === 1 ||
        is_favorite === "1" ||
        is_favorite === "true" ||
        is_favorite === "yes")
        ? 1
        : 0;

    const hasBestsellerFilter =
      is_bestseller !== undefined &&
      is_bestseller !== null &&
      String(is_bestseller).trim() !== "";
    const useBestseller = hasBestsellerFilter ? 1 : 0;
    const bestsellerValue =
      hasBestsellerFilter &&
      (is_bestseller === true ||
        is_bestseller === 1 ||
        is_bestseller === "1" ||
        is_bestseller === "true" ||
        is_bestseller === "yes")
        ? 1
        : 0;

    const hasAvailableFilter =
      is_available !== undefined &&
      is_available !== null &&
      String(is_available).trim() !== "";
    const useAvailable = hasAvailableFilter ? 1 : 0;
    const availableValue =
      !hasAvailableFilter ||
      is_available === true ||
      is_available === 1 ||
      is_available === "1" ||
      is_available === "true" ||
      is_available === "yes"
        ? 1
        : 0;

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
        m.is_favorite,
        m.is_bestseller,
        m.is_available,
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
          ${useFavorite} = 0
          OR (${favoriteValue} = 1 AND m.is_favorite = true)
          OR (${favoriteValue} = 0 AND m.is_favorite = false)
        )
        AND (
          ${useBestseller} = 0
          OR (${bestsellerValue} = 1 AND m.is_bestseller = true)
          OR (${bestsellerValue} = 0 AND m.is_bestseller = false)
        )
        AND (
          ${useAvailable} = 0
          OR (${availableValue} = 1 AND m.is_available = true)
          OR (${availableValue} = 0 AND m.is_available = false)
        )
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
        is_favorite: "pg/bool@1",
        is_bestseller: "pg/bool@1",
        is_available: "pg/bool@1",
        description_en: { codecId: "pg/text@1", nullable: true },
        description_fr: { codecId: "pg/text@1", nullable: true },
        createdAt: "pg/timestamptz-string@1",
        images: "pg/json@1",
      })
      .build();

    const result = await prisma.runtime().query(plan);
    const list = Array.isArray(result) ? result : [];
    const hasMore = list.length > take;
    const page = hasMore ? list.slice(0, take) : list;
    const rows: {
      id: string;
      food_name: string | null;
      category_id: string | null;
      category_name: string | null;
      icon: string | null;
      min_price: number | null;
      max_price: number | null;
      preparation_time: number | null;
      spicy_level: string | null;
      is_favorite: boolean;
      is_bestseller: boolean;
      is_available: boolean;
      description_en: string | null;
      description_fr: string | null;
      createdAt: string;
      images: { id: string; image: string; url: string }[];
    }[] = [];
    for (const row of page) {
      const imageRows = Array.isArray(row.images) ? row.images : [];
      const images = mapUploadImages(imageRows, request);
      rows.push({ ...row, images });
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

    const imageRows = Array.isArray(menu.menu_image) ? menu.menu_image : [];
    const images = mapUploadImages(imageRows, request);

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
        is_favorite: menu.is_favorite,
        is_bestseller: menu.is_bestseller,
        is_available: menu.is_available,
        description_en: menu.description_en,
        description_fr: menu.description_fr,
        createdAt: menu.createdAt,
        updatedAt: menu.updatedAt,
        images,
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
      is_favorite,
      is_bestseller,
      is_available,
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
      category_name = category.name_en || category.name || category.name_fr || null;
      icon = category.icon;
    }

    const prices = resolveStoredPrices(min_price, max_price, existing);

    const menu = await db.menu.where({ id }).update({
      food_name: food_name ?? existing.food_name,
      category_id: category_id ?? existing.category_id,
      category_name,
      icon,
      min_price: prices.min_price,
      max_price: prices.max_price,
      preparation_time: preparation_time
        ? Number(preparation_time)
        : existing.preparation_time,
      spicy_level: spicy_level ?? existing.spicy_level,
      is_favorite:
        is_favorite === undefined || is_favorite === null || is_favorite === ""
          ? existing.is_favorite
          : is_favorite === true ||
            is_favorite === 1 ||
            is_favorite === "1" ||
            is_favorite === "true" ||
            is_favorite === "yes",
      is_bestseller:
        is_bestseller === undefined ||
        is_bestseller === null ||
        is_bestseller === ""
          ? existing.is_bestseller
          : is_bestseller === true ||
            is_bestseller === 1 ||
            is_bestseller === "1" ||
            is_bestseller === "true" ||
            is_bestseller === "yes",
      is_available:
        is_available === undefined ||
        is_available === null ||
        is_available === ""
          ? existing.is_available
          : is_available === true ||
            is_available === 1 ||
            is_available === "1" ||
            is_available === "true" ||
            is_available === "yes",
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

    const imageRows = await db.menu_image
      .select("id", "image")
      .where({ menu_id: id })
      .all();
    const images = mapUploadImages(imageRows, request);

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

export const deleteSingleImage = async (request, reply) => {
  try {
    const { id } = request.params;

    if (!id) {
      return reply.status(400).send({
        success: false,
        message: "id is required!",
      });
    }

    const row = await db.menu_image.where({ id }).first();
    if (!row) {
      return reply.status(404).send({
        success: false,
        message: "Image not found!",
      });
    }

    FileService.removeFile(row.image);
    await db.menu_image.where({ id }).delete();

    return reply.status(200).send({
      success: true,
      message: "Image deleted successfully",
      data: { id },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};
