import "dotenv/config";
import app from "./app";
import { ensureSortColumns } from "./src/utils/ensure-sort-columns";
import { ensureSiteContentTables } from "./src/modules/site_content/site_content.db";

const port = Number(process.env.PORT);

async function start() {
  try {
    await ensureSortColumns();
    await ensureSiteContentTables();
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
