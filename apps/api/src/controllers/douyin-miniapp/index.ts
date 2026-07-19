import type { FastifyInstance, FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import { DouyinMiniappSessionRequestSchema } from "@/schema/douyin-miniapp";
import {
  getDouyinMiniappSessionService,
  type DouyinMiniappSessionService,
} from "@/services/douyin-miniapp/session";
import { ResponseHandler } from "@/utils/response";

type SessionService = Pick<DouyinMiniappSessionService, "exchange">;

export class DouyinMiniappController {
  constructor(
    private readonly service?: SessionService,
  ) {}

  registerExtraRoutes(fastify: FastifyInstance): void {
    fastify.post("/douyin-mini/auth/session", this.createSession);
  }

  createSession = async (request: FastifyRequest) => {
    const result = DouyinMiniappSessionRequestSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);
    const service = this.service ?? getDouyinMiniappSessionService();
    return ResponseHandler.success(await service.exchange(result.data));
  };
}

export default new DouyinMiniappController();
