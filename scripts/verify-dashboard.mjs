import "dotenv/config";
import jwt from "jsonwebtoken";
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const u = await c.query(
  `SELECT id, email, role FROM users WHERE role='admin' LIMIT 1`,
);
const user = u.rows[0];
if (!user) {
  console.log("NO_ADMIN");
  process.exit(1);
}

const token = jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  process.env.JWT_SECRET,
);

const stats = await fetch("http://127.0.0.1:8080/api/dashboard/get?period=today", {
  headers: { token },
});
console.log("STATS", stats.status, await stats.text());

const week = await fetch("http://127.0.0.1:8080/api/dashboard/orders-week", {
  headers: { token },
});
console.log("WEEK", week.status, await week.text());

await c.end();
