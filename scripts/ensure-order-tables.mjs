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

if (!cols.rows.some((r) => r.column_name === "order_number")) {
  await c.query(
    `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS order_number text`,
  );
  console.log("added order_number");
}

await c.end();
console.log("DONE");
