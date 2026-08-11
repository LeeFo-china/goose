import "reflect-metadata";

import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import type {
  TenantServiceRouteAccess,
} from "@gooes/domain";

import { Errors } from "@/errors/error-factory";

const ROUTE_METADATA = Symbol("route_metadata");

interface RouteDefinition {
  path: string;
  method: "get" | "post" | "put" | "patch" | "delete";
  handlerName: string | symbol;
  tenantServiceAccess: TenantServiceRouteAccess;
}

export interface RouteDefinitionOptions {
  tenantServiceAccess?: TenantServiceRouteAccess;
}

type DecoratedRouteHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => unknown | Promise<unknown>;

export function createRouteDecorator(
  method: RouteDefinition["method"],
  defaultAccess: TenantServiceRouteAccess,
) {
  return (
    path: string,
    options: RouteDefinitionOptions = {},
  ): MethodDecorator => {
    return (target, propertyKey) => {
      const constructor = typeof target === "function"
        ? target
        : target.constructor;
      const inheritedRoutes = Reflect.getMetadata(
        ROUTE_METADATA,
        constructor,
      ) as RouteDefinition[] | undefined;
      const routes = inheritedRoutes ? [...inheritedRoutes] : [];

      routes.push({
        path,
        method,
        handlerName: propertyKey,
        tenantServiceAccess: options.tenantServiceAccess ?? defaultAccess,
      });

      Reflect.defineMetadata(ROUTE_METADATA, routes, constructor);
    };
  };
}

export const Get = createRouteDecorator("get", "read");
export const Post = createRouteDecorator("post", "write");
export const Put = createRouteDecorator("put", "write");
export const Patch = createRouteDecorator("patch", "write");
export const Delete = createRouteDecorator("delete", "write");

export function registerRoutes(fastify: FastifyInstance, target: object) {
  const controller = typeof target === "function"
    ? target
    : target.constructor;
  const routes = Reflect.getMetadata(
    ROUTE_METADATA,
    controller,
  ) as RouteDefinition[] | undefined;

  for (const route of routes ?? []) {
    const options = {
      config: { tenantServiceAccess: route.tenantServiceAccess },
    };
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
      const member = (
        target as unknown as Record<PropertyKey, unknown>
      )[route.handlerName];
      if (typeof member !== "function") {
        throw Errors.business(
          500,
          "路由处理器未定义",
          "ROUTE_HANDLER_NOT_DEFINED",
        );
      }

      return await (member as DecoratedRouteHandler).call(
        target,
        request,
        reply,
      );
    };

    switch (route.method) {
      case "get":
        fastify.get(route.path, options, handler);
        break;
      case "post":
        fastify.post(route.path, options, handler);
        break;
      case "put":
        fastify.put(route.path, options, handler);
        break;
      case "patch":
        fastify.patch(route.path, options, handler);
        break;
      case "delete":
        fastify.delete(route.path, options, handler);
        break;
    }
  }
}
