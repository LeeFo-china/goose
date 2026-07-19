import type { FastifyInstance, FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import {
  DouyinCaseListQuerySchema,
  DouyinContentIdParamsSchema,
  DouyinContentPageQuerySchema,
  DouyinMiniappSessionRequestSchema,
} from "@/schema/douyin-miniapp";
import {
  getDouyinMiniappContentService,
  type DouyinMiniappContentService,
} from "@/services/douyin-miniapp/content";
import {
  getDouyinMiniappSessionService,
  type DouyinMiniappSessionService,
} from "@/services/douyin-miniapp/session";
import { ResponseHandler } from "@/utils/response";

type SessionService = Pick<DouyinMiniappSessionService, "exchange">;
type ContentService = Pick<DouyinMiniappContentService,
  | "bootstrap" | "company" | "listCases" | "getCase"
  | "listSites" | "getSite" | "listSiteLogs">;

export class DouyinMiniappController {
  constructor(
    private readonly sessionService?: SessionService,
    private readonly contentService?: ContentService,
  ) {}

  registerExtraRoutes(fastify: FastifyInstance): void {
    fastify.post("/douyin-mini/auth/session", this.createSession);
    fastify.get("/douyin-mini/bootstrap", this.bootstrap);
    fastify.get("/douyin-mini/company", this.company);
    fastify.get("/douyin-mini/cases", this.listCases);
    fastify.get("/douyin-mini/cases/:id", this.getCase);
    fastify.get("/douyin-mini/sites", this.listSites);
    fastify.get("/douyin-mini/sites/:id", this.getSite);
    fastify.get("/douyin-mini/sites/:id/logs", this.listSiteLogs);
  }

  createSession = async (request: FastifyRequest) => {
    const result = DouyinMiniappSessionRequestSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);
    const service = this.sessionService ?? getDouyinMiniappSessionService();
    return ResponseHandler.success(await service.exchange(result.data));
  };

  bootstrap = async (request: FastifyRequest) => ResponseHandler.success(
    await this.content().bootstrap(request.user),
  );

  company = async (request: FastifyRequest) => ResponseHandler.success(
    await this.content().company(request.user),
  );

  listCases = async (request: FastifyRequest) => {
    const query = parse(DouyinCaseListQuerySchema, request.query || {});
    return ResponseHandler.success(await this.content().listCases(request.user, query));
  };

  getCase = async (request: FastifyRequest) => {
    const { id } = parse(DouyinContentIdParamsSchema, request.params || {});
    return ResponseHandler.success(await this.content().getCase(request.user, id));
  };

  listSites = async (request: FastifyRequest) => {
    const query = parse(DouyinContentPageQuerySchema, request.query || {});
    return ResponseHandler.success(await this.content().listSites(request.user, query));
  };

  getSite = async (request: FastifyRequest) => {
    const { id } = parse(DouyinContentIdParamsSchema, request.params || {});
    return ResponseHandler.success(await this.content().getSite(request.user, id));
  };

  listSiteLogs = async (request: FastifyRequest) => {
    const { id } = parse(DouyinContentIdParamsSchema, request.params || {});
    const query = parse(DouyinContentPageQuerySchema, request.query || {});
    return ResponseHandler.success(
      await this.content().listSiteLogs(request.user, id, query),
    );
  };

  private content(): ContentService {
    return this.contentService ?? getDouyinMiniappContentService();
  }
}

function parse<T>(schema: { safeParse(value: unknown):
  { success: true; data: T } | { success: false; error: Parameters<typeof Errors.fromZod>[0] } },
value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

export default new DouyinMiniappController();
