import type { FastifyInstance, FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import {
  DouyinCaseListQuerySchema,
  DouyinAnalyticsRequestSchema,
  DouyinContentIdParamsSchema,
  DouyinContentPageQuerySchema,
  DouyinLeadRequestSchema,
  DouyinLeadSmsRequestSchema,
  DouyinMiniappQaRequestSchema,
  DouyinMiniappSessionRequestSchema,
  DouyinProjectListQuerySchema,
} from "@/schema/douyin-miniapp";
import {
  getDouyinMiniappContentService,
  type DouyinMiniappContentService,
} from "@/services/douyin-miniapp/content";
import {
  getDouyinMiniappMarketingService,
  type DouyinMiniappMarketingService,
} from "@/services/douyin-miniapp/marketing";
import {
  getDouyinMiniappSessionService,
  type DouyinMiniappSessionService,
} from "@/services/douyin-miniapp/session";
import {
  getDouyinMiniappQaService,
  type DouyinMiniappQaService,
} from "@/services/douyin-miniapp/qa";
import { ResponseHandler } from "@/utils/response";
import { resolveTrustedClientIp } from "@/utils/trusted-proxy-client-ip";

type SessionService = Pick<DouyinMiniappSessionService, "exchange">;
type ContentService = Pick<DouyinMiniappContentService,
  | "bootstrap" | "company" | "listCases" | "getCase"
  | "listSites" | "getSite" | "listSiteLogs"
  | "listProjects" | "getProject" | "listProjectLogs">;
type MarketingService = Pick<DouyinMiniappMarketingService,
  "sendCode" | "submitLead" | "recordEvents">;
type QaService = Pick<DouyinMiniappQaService, "ask">;

export class DouyinMiniappController {
  constructor(
    private readonly sessionService?: SessionService,
    private readonly contentService?: ContentService,
    private readonly marketingService?: MarketingService,
    private readonly qaService?: QaService,
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
    fastify.get("/douyin-mini/projects", this.listProjects);
    fastify.get("/douyin-mini/projects/:id", this.getProject);
    fastify.get("/douyin-mini/projects/:id/logs", this.listProjectLogs);
    fastify.post("/douyin-mini/qa", this.askQuestion);
    fastify.post("/douyin-mini/sms/send", this.sendLeadCode);
    fastify.post("/douyin-mini/leads", this.submitLead);
    fastify.post("/douyin-mini/events", this.recordEvents);
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

  listProjects = async (request: FastifyRequest) => {
    const query = parse(DouyinProjectListQuerySchema, request.query || {});
    return ResponseHandler.success(await this.content().listProjects(request.user, query));
  };

  getProject = async (request: FastifyRequest) => {
    const { id } = parse(DouyinContentIdParamsSchema, request.params || {});
    return ResponseHandler.success(await this.content().getProject(request.user, id));
  };

  listProjectLogs = async (request: FastifyRequest) => {
    const { id } = parse(DouyinContentIdParamsSchema, request.params || {});
    const query = parse(DouyinContentPageQuerySchema, request.query || {});
    return ResponseHandler.success(
      await this.content().listProjectLogs(request.user, id, query),
    );
  };

  askQuestion = async (request: FastifyRequest) => ResponseHandler.success(
    await this.qa().ask(
      request.user,
      parse(DouyinMiniappQaRequestSchema, request.body || {}),
    ),
  );

  sendLeadCode = async (request: FastifyRequest) => ResponseHandler.success(
    await this.marketing().sendCode(
      request.user,
      parse(DouyinLeadSmsRequestSchema, request.body || {}),
      requestMetadata(request),
    ),
  );

  submitLead = async (request: FastifyRequest) => ResponseHandler.success(
    await this.marketing().submitLead(
      request.user,
      parse(DouyinLeadRequestSchema, request.body || {}),
      requestMetadata(request),
    ),
  );

  recordEvents = async (request: FastifyRequest) => ResponseHandler.success(
    await this.marketing().recordEvents(
      request.user,
      parse(DouyinAnalyticsRequestSchema, request.body || {}),
      requestMetadata(request),
    ),
  );

  private content(): ContentService {
    return this.contentService ?? getDouyinMiniappContentService();
  }

  private marketing(): MarketingService {
    return this.marketingService ?? getDouyinMiniappMarketingService();
  }

  private qa(): QaService {
    return this.qaService ?? getDouyinMiniappQaService();
  }
}

function requestMetadata(request: FastifyRequest) {
  const rawUserAgent = request.headers?.["user-agent"];
  const userAgent = Array.isArray(rawUserAgent) ? rawUserAgent[0] : rawUserAgent;
  return {
    requestIp: resolveTrustedClientIp(request),
    userAgent: userAgent ?? null,
    log: request.log,
  };
}

function parse<T>(schema: { safeParse(value: unknown):
  { success: true; data: T } | { success: false; error: Parameters<typeof Errors.fromZod>[0] } },
value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

export default new DouyinMiniappController();
