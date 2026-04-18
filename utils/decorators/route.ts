import "reflect-metadata";

// 定义元数据 Key
const ROUTE_METADATA = Symbol("route_metadata");

interface RouteDefinition {
    path: string;
    method: "get" | "post" | "put" | "patch" | "delete";
    handlerName: string | symbol;
}

// 装饰器工厂函数
export function createRouteDecorator(method: string) {
    return (path: string): MethodDecorator => {
        return (target: any, propertyKey: string | symbol) => {
            // 💡 重点：静态方法的 target 就是类构造函数本身
            // 如果是非静态方法，target 是类的原型(prototype)，所以统一取 target 比较稳妥
            const constructor = typeof target === "function"
                ? target
                : target.constructor;

            const routes: RouteDefinition[] =
                Reflect.getMetadata(ROUTE_METADATA, constructor) || [];

            routes.push({
                path,
                method: method as any,
                handlerName: propertyKey,
            });

            Reflect.defineMetadata(ROUTE_METADATA, routes, constructor);
        };
    };
}

export const Get = createRouteDecorator("get");
export const Post = createRouteDecorator("post");
export const Put = createRouteDecorator("put");
export const Patch = createRouteDecorator("patch");
export const Delete = createRouteDecorator("delete");

export function registerRoutes(fastify: any, target: any) {
    // 💡 适配点：如果传入的是实例，取其构造函数；如果传入的是类，直接使用
    const controller = typeof target === "function"
        ? target
        : target.constructor;
    const instance = typeof target === "function" ? target : target;

    const routes: RouteDefinition[] =
        Reflect.getMetadata(ROUTE_METADATA, controller) || [];

    routes.forEach((route) => {
        fastify[route.method](route.path, async (request: any, reply: any) => {
            // 💡 确保 this 指向正确（指向实例 instance）
            return await instance[route.handlerName](request, reply);
        });
    });
}
