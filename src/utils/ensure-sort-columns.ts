import { prisma } from "../../prisma/db";

/** Adds position columns the live database was missing, then backfills them. */
export async function ensureSortColumns() {
  await prisma.runtime().query(
    prisma.raw
      .sql`ALTER TABLE category ADD COLUMN IF NOT EXISTS sort_order integer`
      .affectedCount()
      .build(),
  );
  await prisma.runtime().query(
    prisma.raw
      .sql`ALTER TABLE menu ADD COLUMN IF NOT EXISTS sort_order integer`
      .affectedCount()
      .build(),
  );
  await prisma.runtime().query(
    prisma.raw
      .sql`ALTER TABLE company_info ADD COLUMN IF NOT EXISTS whatsapp_numbers text`
      .affectedCount()
      .build(),
  );
  await prisma.runtime().query(
    prisma.raw.sql`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
        FROM category
        WHERE sort_order IS NULL
      ),
      base AS (
        SELECT COALESCE(MAX(sort_order), 0) AS m FROM category
      )
      UPDATE category AS c
      SET sort_order = base.m + ranked.rn
      FROM ranked, base
      WHERE c.id = ranked.id
    `
      .affectedCount()
      .build(),
  );
  await prisma.runtime().query(
    prisma.raw.sql`
      WITH ranked AS (
        SELECT id,
               category_id,
               ROW_NUMBER() OVER (
                 PARTITION BY category_id
                 ORDER BY "createdAt" ASC, id ASC
               ) AS rn
        FROM menu
        WHERE sort_order IS NULL
      ),
      base AS (
        SELECT category_id, COALESCE(MAX(sort_order), 0) AS m
        FROM menu
        GROUP BY category_id
      )
      UPDATE menu AS m
      SET sort_order = COALESCE(base.m, 0) + ranked.rn
      FROM ranked
      LEFT JOIN base ON base.category_id IS NOT DISTINCT FROM ranked.category_id
      WHERE m.id = ranked.id
    `
      .affectedCount()
      .build(),
  );
}
