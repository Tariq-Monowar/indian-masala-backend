import { prisma } from "../../../prisma/db";

export type GalleryImageRow = {
  slot: number;
  image: string;
  updatedAt: string;
};

export async function ensureSiteContentTables() {
  await prisma.runtime().query(
    prisma.raw.sql`
      CREATE TABLE IF NOT EXISTS site_gallery_image (
        slot integer PRIMARY KEY,
        image text NOT NULL,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `
      .affectedCount()
      .build(),
  );
}

export async function listGalleryImages(): Promise<GalleryImageRow[]> {
  const rows = await prisma.runtime().query(
    prisma.raw.sql`
      SELECT slot, image, "updatedAt"
      FROM site_gallery_image
      ORDER BY slot ASC
    `
      .returnsRow({
        slot: "pg/int4@1",
        image: "pg/text@1",
        updatedAt: "pg/timestamptz-string@1",
      })
      .build(),
  );
  return Array.isArray(rows) ? (rows as GalleryImageRow[]) : [];
}

export async function findGalleryImage(slot: number) {
  const rows = await prisma.runtime().query(
    prisma.raw.sql`
      SELECT image FROM site_gallery_image WHERE slot = ${slot}
    `
      .returnsRow({ image: "pg/text@1" })
      .build(),
  );
  return Array.isArray(rows) ? (rows[0]?.image ?? null) : null;
}

export async function saveGalleryImage(slot: number, image: string) {
  const rows = await prisma.runtime().query(
    prisma.raw.sql`
      INSERT INTO site_gallery_image (slot, image, "updatedAt")
      VALUES (${slot}, ${image}, now())
      ON CONFLICT (slot)
      DO UPDATE SET image = EXCLUDED.image, "updatedAt" = now()
      RETURNING slot, image, "updatedAt"
    `
      .returnsRow({
        slot: "pg/int4@1",
        image: "pg/text@1",
        updatedAt: "pg/timestamptz-string@1",
      })
      .build(),
  );
  return Array.isArray(rows) ? ((rows[0] as GalleryImageRow) ?? null) : null;
}

export async function deleteGalleryImage(slot: number) {
  await prisma.runtime().query(
    prisma.raw.sql`
      DELETE FROM site_gallery_image WHERE slot = ${slot}
    `
      .affectedCount()
      .build(),
  );
}
