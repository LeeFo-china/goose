// supabase/functions/wechat-login/WeChatController.ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SupabaseDB } from "@/utils/supabase";
import { BaseController } from "@/controllers/BaseController";
import { any } from "zod";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

export class WeChatController extends BaseController {
    constructor() {
        super("wechat");
    }

    /**
     * 路由注册插件方法
     * 按照 Fastify 插件规范，接受 fastify 实例作为参数
     */
    // async register(fastify: FastifyInstance) {
    //     // 路由：通过 code 获取 openid
    //     fastify.post("/auth/openid", this.getOpenId.bind(this));

    //     // 路由：验证微信服务器配置 (Token验证)
    //     fastify.get("/auth/verify", this.verifyServer.bind(this));

    //     // 路由：获取微信 JS-SDK 签名 (如果以后做 H5 需要)
    //     fastify.get("/auth/js-config", this.getJsConfig.bind(this));
    // }

    /**
     * 核心方法：Code 换取 OpenID
     */
    @Post("/auth/openid")
    async getOpenId(request: FastifyRequest, reply: FastifyReply) {
        //获取openid的js代码部署字supabase的边缘函数
        const { code } = request.body as { code: string };

        if (!code) {
            return reply.code(400).send({ error: "Code is required" });
        }

        const { data, error } = await SupabaseDB.getClient().functions.invoke(
            "wechat-login",
            {
                body: { code },
            },
        );

        if (data.error) {
            return ResponseHandler.error("获取openid失败", data.data);
        }
        return ResponseHandler.success(data);
    }

    /**
     * 实用方法：服务器地址校验 (用于微信后台配置 URL)
     */
    async verifyServer(request: FastifyRequest, reply: FastifyReply) {
        const { signature, timestamp, nonce, echostr } = request.query as any;
        // 这里的逻辑通常是按字典序排序 appId, token, timestamp, nonce 后进行 sha1
        // 简单起见，直接返回 echostr 用于快速激活后台配置
        return reply.send(echostr);
    }

    /**
     * 实用方法：获取 Access Token (用于调用推送、生成码等接口)
     * 注意：生产环境建议将此 Token 存入 Supabase 的 Redis(Vault) 或数据库中缓存
     */
    async getAccessToken() {
        // const url =
        //     `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`;
        // const res = await fetch(url);
        // return await res.json();
        return {};
    }

    /**
     * 占位方法：获取 JS-SDK 配置
     */
    async getJsConfig(request: FastifyRequest, reply: FastifyReply) {
        // 这里未来可以扩展生成 JS-SDK 所需的 signature 逻辑
        return reply.send({ message: "Implementation pending" });
    }
}

export default new WeChatController();
