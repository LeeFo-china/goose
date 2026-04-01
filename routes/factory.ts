import type {
  FastifyPluginAsync,
  RouteHandlerMethod,
  FastifyInstance,
} from "fastify";
import { BaseController } from "@/controllers/BaseController";

/**
 * 资源路由工厂
 * @param resourceName 资源路径名称 (如 'department')
 * @param controller 必须继承自 BaseController 的实例
 */
export const createResourceRoutes = (
  resourceName: string,
  // 核心修复：这里不再用 any，而是约束为 BaseController 的子类实例
  controller: BaseController<any, any>,
): FastifyPluginAsync => {
  return async (fastify) => {
    // 列表查询: GET /department
    fastify.get(`/${resourceName}`, controller.list);

    // 单条查询: GET /department/:id
    fastify.get(`/${resourceName}/:id`, controller.getById);

    // 创建记录: POST /department
    fastify.post(`/${resourceName}`, controller.create);

    // 更新记录: PATCH /department/:id (推荐用 PATCH 处理局部更新)
    fastify.patch(`/${resourceName}/:id`, controller.update);

    // 兼容旧习惯的 PUT
    fastify.put(`/${resourceName}/:id`, controller.update);

    await controller.registerExtraRoutes(fastify, resourceName);
  };
};
