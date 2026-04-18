import "reflect-metadata"; // 必须在第一行
import Fastify from "fastify";
import AutoLoad from "@fastify/autoload";
import multipart from "@fastify/multipart";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import errorHandler from "./plugins/error-handler";
import authPlugin from "./plugins/auth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = Fastify({
  logger: true,
});
app.register(multipart, {
  limits: {
    files: 9,
    fileSize: 10 * 1024 * 1024,
  },
});
app.register(errorHandler);
authPlugin(app);
app.register(AutoLoad, {
  dir: join(__dirname, "routes"),
});

app.listen({ port: Number(process.env.PORT), host: "0.0.0.0" }, (err) => {
  if (err) throw err;
  
  if (process.env.NODE_ENV === "development") {
    console.log("\n📋 Registered Routes:");
    console.log(app.printRoutes());
    console.log("\n");
  }
});
