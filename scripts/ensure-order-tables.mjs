import "dotenv/config";
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const tables = await c.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
);
console.log(
  "TABLES:",
  tables.rows.map((r) => r.table_name).join(", "),
);

const hasOrder = tables.rows.some((r) => r.table_name === "order");
const hasOrderItem = tables.rows.some((r) => r.table_name === "order_item");
console.log("has order", hasOrder, "has order_item", hasOrderItem);

if (!hasOrder) {
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
  console.log("created order table");
}

if (!hasOrderItem) {
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
  console.log("created order_item table");
}

const cols = await c.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name='order'`,
);
console.log(
  "order cols",
  cols.rows.map((r) => r.column_name).join(", "),
);

for (const col of ["order_number", "name", "email", "phone"]) {
  if (!cols.rows.some((r) => r.column_name === col)) {
    await c.query(`ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "${col}" text`);
    console.log("added", col);
  }
}

await c.query(
  `ALTER TABLE category ADD COLUMN IF NOT EXISTS sort_order integer`,
);
await c.query(`ALTER TABLE menu ADD COLUMN IF NOT EXISTS sort_order integer`);

await c.query(`
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
`);

await c.query(`
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
`);

console.log("sort_order columns ready");

await c.end();
console.log("DONE");
