import { db, prisma } from "../../../../prisma/db";

export const createCategory = async (request, reply) => {
  try {
    const { name, name_en, name_fr, icon } = request.body || {};
    const nextNameEn = name_en || name;
    const nextNameFr = name_fr || name;

    if (!nextNameEn || !nextNameFr) {
      return reply.status(400).send({
        success: false,
        message: "name_en and name_fr are required!",
      });
    }

    const category = await db.category.create({
      name: nextNameEn,
      name_en: nextNameEn,
      name_fr: nextNameFr,
      icon: icon || null,
    });

    const nextOrderPlan = prisma.raw.sql`
      SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
      FROM category
    `
      .returnsRow({
        next_order: "pg/int4@1",
      })
      .build();
    const nextOrderRows = await prisma.runtime().query(nextOrderPlan);
    const nextOrder = Array.isArray(nextOrderRows)
      ? Number(nextOrderRows[0]?.next_order) || 1
      : 1;
    const placePlan = prisma.raw.sql`
      UPDATE category
      SET sort_order = ${nextOrder}
      WHERE id = ${category.id}
      RETURNING id
    `
      .returnsRow({
        id: "pg/text@1",
      })
      .build();
    await prisma.runtime().query(placePlan);

    return reply.status(201).send({
      success: true,
      data: {
        id: category.id,
        name_en: category.name_en || category.name || null,
        name_fr: category.name_fr || category.name || null,
        icon: category.icon ?? null,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
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

export const getAllCategory = async (request, reply) => {
  try {
    const { cursor, limit, search } = request.query;
    const take = Number(limit) || 20;
    const searchPattern = search
      ? "%" + String(search).split(" ").join("%") + "%"
      : "";
    const cursorId = cursor || "";

    const plan = prisma.raw.sql`
      SELECT
        c.id,
        c.name,
        c.name_en,
        c.name_fr,
        c.icon,
        c."createdAt"
      FROM category c
      WHERE
        (
          ${searchPattern} = ''
          OR COALESCE(c.name_en, '') ILIKE ${searchPattern}
          OR COALESCE(c.name_fr, '') ILIKE ${searchPattern}
          OR COALESCE(c.name, '') ILIKE ${searchPattern}
        )
        AND (
          ${cursorId} = ''
          OR (COALESCE(c.sort_order, 0), c.id) > (
            SELECT COALESCE(s.sort_order, 0), s.id
            FROM category s
            WHERE s.id = ${cursorId}
          )
        )
      ORDER BY COALESCE(c.sort_order, 0) ASC, c.id ASC
      LIMIT ${take + 1}
    `
      .returnsRow({
        id: "pg/text@1",
        name: { codecId: "pg/text@1", nullable: true },
        name_en: { codecId: "pg/text@1", nullable: true },
        name_fr: { codecId: "pg/text@1", nullable: true },
        icon: { codecId: "pg/text@1", nullable: true },
        createdAt: "pg/timestamptz-string@1",
      })
      .build();

    const result = await prisma.runtime().query(plan);
    const list = Array.isArray(result) ? result : [];
    const hasMore = list.length > take;
    const page = hasMore ? list.slice(0, take) : list;
    const rows: {
      id: string;
      name_en: string | null;
      name_fr: string | null;
      icon: string | null;
      createdAt: string;
    }[] = [];
    for (const row of page) {
      rows.push({
        id: row.id,
        name_en: row.name_en || row.name || null,
        name_fr: row.name_fr || row.name || null,
        icon: row.icon ?? null,
        createdAt: row.createdAt,
      });
    }

    return reply.status(200).send({
      success: true,
      data: rows,
      pagination: { hasMore },
    });
  } catch (error) {
    request.log.error(error);
    const detail = error instanceof Error ? error.message : "Unknown error";
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
      detail,
    });
  }
};

export const updateCategory = async (request, reply) => {
  try {
    const { id } = request.params;
    const { name, name_en, name_fr, icon } = request.body || {};

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

    const nextNameEn =
      name_en !== undefined
        ? name_en
        : name !== undefined
          ? name
          : existing.name_en || existing.name;
    const nextNameFr =
      name_fr !== undefined
        ? name_fr
        : name !== undefined
          ? name
          : existing.name_fr || existing.name;

    if (!nextNameEn || !nextNameFr) {
      return reply.status(400).send({
        success: false,
        message: "name_en and name_fr are required!",
      });
    }

    const category = await db.category.where({ id }).update({
      name: nextNameEn,
      name_en: nextNameEn,
      name_fr: nextNameFr,
      icon: icon !== undefined ? icon || null : existing.icon,
    });

    if (!category) {
      return reply.status(404).send({
        success: false,
        message: "Category not found!",
      });
    }

    // Keep denormalized menu fields in sync (English primary for category_name)
    const linkedMenus = await db.menu
      .select("id")
      .where({ category_id: id })
      .all();
    for (const menu of linkedMenus) {
      await db.menu.where({ id: menu.id }).update({
        category_name: nextNameEn,
        icon: icon !== undefined ? icon || null : existing.icon,
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        id: category.id,
        name_en: category.name_en || category.name || null,
        name_fr: category.name_fr || category.name || null,
        icon: category.icon ?? null,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
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

export const reorderCategories = async (request, reply) => {
  try {
    const rawIds = Array.isArray(request.body?.ids) ? request.body.ids : [];
    const requested = [];
    for (const value of rawIds) {
      if (typeof value === "string" && value.trim()) {
        requested.push(value.trim());
      }
    }

    if (requested.length === 0) {
      return reply.status(400).send({
        success: false,
        message: "ids is required!",
      });
    }

    const existingPlan = prisma.raw.sql`
      SELECT id
      FROM category
      ORDER BY COALESCE(sort_order, 0) ASC, id ASC
    `
      .returnsRow({
        id: "pg/text@1",
      })
      .build();
    const existingRows = await prisma.runtime().query(existingPlan);
    const existing = Array.isArray(existingRows)
      ? existingRows.map((row) => row.id)
      : [];
    const existingSet = new Set(existing);
    const seen = new Set();
    const leading = [];
    for (const id of requested) {
      if (!existingSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      leading.push(id);
    }
    const ordered = leading.concat(existing.filter((id) => !seen.has(id)));

    for (let index = 0; index < ordered.length; index += 1) {
      const placePlan = prisma.raw.sql`
        UPDATE category
        SET sort_order = ${index + 1}
        WHERE id = ${ordered[index]}
        RETURNING id
      `
        .returnsRow({
          id: "pg/text@1",
        })
        .build();
      await prisma.runtime().query(placePlan);
    }

    return reply.status(200).send({
      success: true,
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
