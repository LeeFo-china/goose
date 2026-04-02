import type {
  FastifyError,
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
} from "fastify";
import { createResourceRoutes } from "./factory";

import PaymentController from "@/controllers/payment";
import ProjectController from "@/controllers/projects";
import DepartmentController from "@/controllers/departments";
import EmployeeController from "@/controllers/employee";
import CustomerController from "@/controllers/customer";
import PostsController from "@/controllers/posts";
import { WeChatController } from "@/controllers/wechat";

const wechat = new WeChatController();

const indexRoutes: FastifyPluginAsync = async (app, options) => {
  app.get("/", async (request, reply) => {
    return { hello: "world" };
  });

  wechat.register(app);
  app.register(createResourceRoutes("customers", CustomerController));
  app.register(createResourceRoutes("employees", EmployeeController));
  app.register(createResourceRoutes("departments", DepartmentController));
  app.register(createResourceRoutes("payments", PaymentController));
  app.register(createResourceRoutes("projects", ProjectController));
  app.register(createResourceRoutes("posts", PostsController));
};

export default indexRoutes;
