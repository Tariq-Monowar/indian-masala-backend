import { db, prisma } from "../../../../prisma/db";

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveLocalizedNames(body: {
  name?: unknown;
  name_en?: unknown;
  name_fr?: unknown;
}) {
  const name_en = trimText(body.name_en) || trimText(body.name);
  const name_fr = trimText(body.name_fr) || trimText(body.name);
  return { name_en, name_fr };
}

function mapCategoryRow(row: {
  id: string;
  name?: string | null;
  name_en?: string | null;
  name_fr?: string | null;
  icon?: string | null;
  createdAt?: string;
  updatedAt?: string;
}) {
  const name_en = trimText(row.name_en) || trimText(row.name);
  const name_fr = trimText(row.name_fr) || trimText(row.name);
  return {
    id: row.id,
    name_en: name_en || null,
    name_fr: name_fr || null,
    icon: row.icon ?? null,
    ...(row.createdAt ? { createdAt: row.createdAt } : {}),
    ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
  };
}

export const createCategory = async (request, reply) => {
  try {
    const { name_en, name_fr } = resolveLocalizedNames(request.body || {});
    const icon = trimText(request.body?.icon) || null;

    if (!name_en || !name_fr) {
      return reply.status(400).send({
        success: false,
        message: "name_en and name_fr are required!",
      });
    }

    const category = await db.category.create({
      // DB `name` kept in sync with EN only for old menu.category_name denorm
      name: name_en,
      name_en,
      name_fr,
      icon,
    });

    return reply.status(201).send({
      success: true,
      data: mapCategoryRow(category),
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
    const searchText = trimText(search);
    const searchPattern = searchText
      ? "%" + searchText.split(" ").join("%") + "%"
      : "";
    const cursorId = typeof cursor === "string" ? cursor : "";

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
          OR c.id > ${cursorId}
        )
      ORDER BY c.id ASC
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
    const rows = hasMore ? list.slice(0, take) : list;

    return reply.status(200).send({
      success: true,
      data: rows.map(mapCategoryRow),
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
    const body = request.body || {};

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

    const hasNameEn = Object.prototype.hasOwnProperty.call(body, "name_en");
    const hasNameFr = Object.prototype.hasOwnProperty.call(body, "name_fr");
    const hasName = Object.prototype.hasOwnProperty.call(body, "name");
    const hasIcon = Object.prototype.hasOwnProperty.call(body, "icon");

    const nextNameEn = hasNameEn
      ? trimText(body.name_en)
      : hasName
        ? trimText(body.name)
        : trimText(existing.name_en) || trimText(existing.name);
    const nextNameFr = hasNameFr
      ? trimText(body.name_fr)
      : hasName && !hasNameFr
        ? trimText(body.name)
        : trimText(existing.name_fr) || trimText(existing.name);

    if (!nextNameEn || !nextNameFr) {
      return reply.status(400).send({
        success: false,
        message: "name_en and name_fr are required!",
      });
    }

    const nextIcon = hasIcon ? trimText(body.icon) || null : existing.icon;

    const category = await db.category.where({ id }).update({
      name: nextNameEn,
      name_en: nextNameEn,
      name_fr: nextNameFr,
      ...(hasIcon ? { icon: nextIcon } : {}),
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
        ...(hasIcon ? { icon: nextIcon } : {}),
      });
    }

    return reply.status(200).send({
      success: true,
      data: mapCategoryRow(category),
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
