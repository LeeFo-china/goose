import Fastify from "fastify";
import AutoLoad from "@fastify/autoload";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import errorHandler from "./plugins/error-handler";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = Fastify({
  logger: true,
});
app.register(errorHandler);
// 注册所有路由
app.register(AutoLoad, {
  dir: join(__dirname, "routes"),
});

app.ready(() => {
  console.log(app.printRoutes());
});

app.listen({ port: Number(process.env.PORT) }, (err) => {
  if (err) throw err;
});
