import type { FastifyPluginAsync, FastifyReply } from "fastify";
import UserController from "../controllers/user/index";

const userRoutes: FastifyPluginAsync = async (fastify, options) => {
  // const user = new UserController();
  fastify.get("/user/:id", UserController.getUser);
  fastify.post("/user", UserController.postUser);
  fastify.put("/user/:id", UserController.updateUser);
};

export default userRoutes;
