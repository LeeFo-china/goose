// supabase/functions/wechat-login/RpcController.ts

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SupabaseDB } from "@/utils/supabase";
import { Errors } from "@/errors/error-factory";
import { fail, ResponseHandler, success } from "@/utils/response";
import type { ApiResponse, HomeStatsResponse } from "@/types/api";
import { BaseController } from "@/controllers/BaseController";

// export class RpcController {
//     /**
//      * 静态注册方法
//      * 无需实例化，直接 RpcController.register(fastify)
//      */
//     static async register(fastify: FastifyInstance) {
//         // 使用箭头函数包装，确保调用静态方法时上下文正确
//         fastify.get(
//             "/home_stats",
//             (request, reply) => this.get_home_dashboard_stats(request, reply),
//         );
//     }

//     /**
//      * 核心方法：调用 RPC 获取首页统计数据
//      * 改为 static 静态方法
//      */
//     private static async get_home_dashboard_stats(
//         request: FastifyRequest,
//         reply: FastifyReply,
//     ) {
//         const { data, error } = await SupabaseDB.getClient().rpc(
//             "get_home_dashboard_stats",
//         );

//         if (error) {
//             // 保持你原有的错误处理逻辑
//             throw Errors.dbError(
//                 "call rpc get_home_dashboard_stats error",
//             );
//         }

//         // Fastify 会自动将 Object 序列化为 JSON 返回

//         // return { data: data, error: null, message: "success" };
//         return ResponseHandler.success<HomeStatsResponse>(data);
//     }
// }

import { Get, Post, registerRoutes } from "@/utils/decorators/route";
import { any } from "zod";
// ... 其他导入

export class RpcController extends BaseController {
    /**
     * 插件入口：现在只需要调用工具函数
     */
    // static async register(fastify: FastifyInstance) {
    //     registerRoutes(fastify, RpcController);
    //     console.log("路由注册完成！");
    // }
    constructor() {
        super("rpc");
    }

    @Get("/home_stats")
    async get_home_dashboard_stats(
        request: FastifyRequest,
        reply: FastifyReply,
    ) {
        const { data, error } = await SupabaseDB.getClient().rpc(
            "get_home_dashboard_stats",
        );

        console.log(request.id);

        if (error) throw Errors.dbError("call rpc error");

        return ResponseHandler.success<HomeStatsResponse>(data);
    }
}

export default new RpcController();
