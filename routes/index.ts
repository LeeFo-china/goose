import type { FastifyPluginAsync, FastifyReply, FastifyError } from "fastify";
import { createResourceRoutes } from "./factory";
import userRoutes from "./customer";

import departments from "./departments";
import projects from "./projects";
import PaymentController from "@/controllers/payment";
import ProjectController from "@/controllers/projects";
import DepartmentController from "@/controllers/departments";
import EmployeeController from "@/controllers/employee";
import CustomerController from "@/controllers/customer";

const indexRoutes: FastifyPluginAsync = async (app, options) => {
  app.get("/", async (request, reply) => {
    return { hello: "world" };
  });
  app.register(createResourceRoutes("customers", CustomerController));
  app.register(createResourceRoutes("employees", EmployeeController));
  app.register(createResourceRoutes("departments", DepartmentController));
  app.register(createResourceRoutes("payments", PaymentController));
  app.register(createResourceRoutes("projects", ProjectController));
};

export default indexRoutes;
