import "dotenv/config";
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const tablesRes = await c.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
);
const existing = new Set(tablesRes.rows.map((r) => r.table_name));
console.log("EXISTING:", [...existing].join(", "));

async function hasColumn(table, column) {
  const r = await c.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column],
  );
  return r.rowCount > 0;
}

if (!existing.has("company_info")) {
  await c.query(`
    CREATE TABLE IF NOT EXISTS company_info (
      id text PRIMARY KEY,
      company_name text,
      company_email text,
      company_phone text,
      address text,
      city text,
      country text,
      location_label text,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("created company_info");
}

if (!existing.has("notification")) {
  await c.query(`
    CREATE TABLE IF NOT EXISTS notification (
      id text PRIMARY KEY,
      message text,
      is_read boolean NOT NULL DEFAULT false,
      user_id text REFERENCES users(id) ON DELETE CASCADE,
      object_id text,
      type text,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    );
  `);
  await c.query(
    `CREATE INDEX IF NOT EXISTS notification_user_id_idx ON notification (user_id)`,
  );
  console.log("created notification");
}

if (!existing.has("order")) {
  await c.query(`
    CREATE TABLE IF NOT EXISTS "order" (
      id text PRIMARY KEY,
      order_number text,
      name text,
      email text,
      phone text,
      user_id text REFERENCES users(id) ON DELETE CASCADE,
      total_price double precision,
      status text,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
  `);
  await c.query(
    `CREATE INDEX IF NOT EXISTS order_user_id_idx ON "order" (user_id)`,
  );
  console.log("created order");
}

for (const col of ["order_number", "name", "email", "phone"]) {
  if (!(await hasColumn("order", col))) {
    await c.query(`ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "${col}" text`);
    console.log(`added order.${col}`);
  }
}

if (!existing.has("order_item")) {
  await c.query(`
    CREATE TABLE IF NOT EXISTS order_item (
      id text PRIMARY KEY,
      order_id text REFERENCES "order"(id) ON DELETE CASCADE,
      menu_id text REFERENCES menu(id) ON DELETE CASCADE,
      unit_price double precision,
      quantity integer,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
  `);
  await c.query(
    `CREATE INDEX IF NOT EXISTS order_item_order_id_idx ON order_item (order_id)`,
  );
  await c.query(
    `CREATE INDEX IF NOT EXISTS order_item_menu_id_idx ON order_item (menu_id)`,
  );
  console.log("created order_item");
}

if (existing.has("menu") && !(await hasColumn("menu", "company_info_id"))) {
  await c.query(
    `ALTER TABLE menu ADD COLUMN IF NOT EXISTS company_info_id text`,
  );
  console.log("added menu.company_info_id");
}

const after = await c.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
);
console.log(
  "AFTER:",
  after.rows.map((r) => r.table_name).join(", "),
);

await c.end();
console.log("DONE");
