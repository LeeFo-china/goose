import type { FastifyPluginAsync } from "fastify";
import { BaseController } from "@/controllers/BaseController";

export type ResourceCrudRouteConfig = {
  list: boolean;
  getById: boolean;
  create: boolean;
  update: boolean;
};

/**
 * 资源路由工厂
 * @param resourceName 资源路径名称 (如 'department')
 * @param controller 必须继承自 BaseController 的实例
 * @param routes 必须显式声明要暴露的 CRUD，避免默认挂载裸 BaseController 方法
 */
export const createResourceRoutes = (
  resourceName: string,
  // 核心修复：这里不再用 any，而是约束为 BaseController 的子类实例
  controller: BaseController<any, any>,
  routes: ResourceCrudRouteConfig,
): FastifyPluginAsync => {
  return async (fastify) => {
    if (routes.list) {
      fastify.get(`/${resourceName}`, controller.list);
    }

    if (routes.getById) {
      fastify.get(`/${resourceName}/:id`, controller.getById);
    }

    if (routes.create) {
      fastify.post(`/${resourceName}`, controller.create);
    }

    if (routes.update) {
      fastify.patch(`/${resourceName}/:id`, controller.update);
      fastify.put(`/${resourceName}/:id`, controller.update);
    }

    await controller.registerExtraRoutes(fastify, resourceName);
  };
};
