import "dotenv/config";
import app from "./app";

const port = Number(process.env.PORT);

async function start() {
  try {
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
