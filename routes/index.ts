import type { FastifyPluginAsync, FastifyReply, FastifyError } from "fastify";
import userRoutes from "./customer";
const indexRoutes: FastifyPluginAsync = async (app, options) => {
  app.get("/", async (request, reply) => {
    return { hello: "world" };
  });

  app.register(userRoutes);
};

export default indexRoutes;
