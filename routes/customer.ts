import type { FastifyPluginAsync, FastifyReply } from "fastify";
import UserController from "../controllers/customer/index";

const userRoutes: FastifyPluginAsync = async (fastify, options) => {
  // const user = new UserController();
  fastify.get("/customer/:id", UserController.getUserById);
  fastify.get("/customer", UserController.getUser);
  fastify.post("/customer", UserController.postUser);
  fastify.put("/customer/:id", UserController.updateUser);
};

export default userRoutes;
