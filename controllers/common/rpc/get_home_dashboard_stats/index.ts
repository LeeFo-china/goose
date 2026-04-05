// supabase/functions/wechat-login/RpcController.ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SupabaseDB } from "@/utils/supabase";
import { Errors } from "@/errors/error-factory";

export class RpcController {
    /**
     * 静态注册方法
     * 无需实例化，直接 RpcController.register(fastify)
     */
    static async register(fastify: FastifyInstance) {
        // 使用箭头函数包装，确保调用静态方法时上下文正确
        fastify.get(
            "/home_stats",
            (request, reply) => this.get_home_dashboard_stats(request, reply),
        );
    }

    /**
     * 核心方法：调用 RPC 获取首页统计数据
     * 改为 static 静态方法
     */
    private static async get_home_dashboard_stats(
        request: FastifyRequest,
        reply: FastifyReply,
    ) {
        const { data, error } = await SupabaseDB.getClient().rpc(
            "get_home_dashboard_stats",
        );

        if (error) {
            // 保持你原有的错误处理逻辑
            throw Errors.dbError("call rpc get_home_dashboard_stats error");
        }

        // Fastify 会自动将 Object 序列化为 JSON 返回
        return data;
    }
}
