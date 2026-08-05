import { Errors } from "@/errors/error-factory";
import {
  tenantServiceProvidersRepository,
  type TenantServiceProviderMutation,
  type TenantServiceProvidersRepository,
} from "@/repositories/tenant-service-providers";
import type {
  CreateTenantServiceProviderAreaInput,
  PublishTenantServiceProviderProfileInput,
  ReturnTenantServiceProviderProfileToDraftInput,
  SubmitTenantServiceProviderProfileInput,
  SuspendTenantServiceProviderProfileInput,
  TenantServiceProviderAreaListQuery,
  TenantServiceProviderPublicationListQuery,
  UpdateTenantServiceProviderAreaInput,
  UpdateTenantServiceProviderProfileInput,
  VisitorLocalServiceProviderListQuery,
} from "@/schema/tenant-onboarding";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { userLocationContextRepository } from "@/repositories/user-location-contexts";
import type { JwtPayload } from "@/utils/jwt";

const TENANT_PERMISSION = "service_provider.profile.manage";
const PLATFORM_PERMISSION = "platform.service_provider.publish";
const MAX_PAGE_SIZE = 100;

type RepositoryPort = Pick<TenantServiceProvidersRepository,
  | "getTenantProfile" | "updateTenantProfile" | "listTenantAreas"
  | "createTenantArea" | "updateTenantArea" | "submitTenantProfile"
  | "listPlatformPublicationQueue" | "getPlatformPublicationDetail"
  | "listPlatformPublicationAreas" | "publishProfile"
  | "returnProfileToDraft" | "suspendProfile" | "resolveActiveRegionCodes"
  | "listVisitorProviders">;
type AccessPolicyPort = Pick<typeof accessPolicyService,
  "assertTenantContext" | "assertPermission">;
type AuditPort = Pick<typeof platformAuditLogService, "recordBestEffort">;
type LocationContextPort = Pick<typeof userLocationContextRepository,
  "findLatestActiveForVisitor">;

type Dependencies = {
  repository?: RepositoryPort;
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
  locationContexts?: LocationContextPort;
};

export class TenantServiceProvidersService {
  private readonly repository: RepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;
  private readonly locationContexts: LocationContextPort;

  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ?? tenantServiceProvidersRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
    this.locationContexts = dependencies.locationContexts ?? userLocationContextRepository;
  }

  async getTenantProfile(authContext: AuthContext) {
    const tenantId = this.requireTenantManager(authContext);
    const profile = await this.repository.getTenantProfile(tenantId);
    if (!profile) throw notFound();
    return profile;
  }

  async updateTenantProfile(
    authContext: AuthContext,
    input: UpdateTenantServiceProviderProfileInput,
  ) {
    const tenantId = this.requireTenantManager(authContext);
    const { version, ...patch } = input;
    return this.requireMutation(await this.repository.updateTenantProfile({
      tenantId, expectedVersion: version, patch,
    }));
  }

  listTenantAreas(authContext: AuthContext, query: TenantServiceProviderAreaListQuery) {
    const tenantId = this.requireTenantManager(authContext);
    return this.repository.listTenantAreas({ tenantId, ...normalizePage(query) });
  }

  async createTenantArea(
    authContext: AuthContext,
    input: CreateTenantServiceProviderAreaInput,
  ) {
    const tenantId = this.requireTenantManager(authContext);
    const { version, ...area } = input;
    return this.requireMutation(await this.repository.createTenantArea({
      tenantId, expectedProfileVersion: version, input: area,
    }));
  }

  async updateTenantArea(
    authContext: AuthContext,
    areaId: string,
    input: UpdateTenantServiceProviderAreaInput,
  ) {
    const tenantId = this.requireTenantManager(authContext);
    const { version, ...area } = input;
    return this.requireMutation(await this.repository.updateTenantArea({
      tenantId, areaId, expectedProfileVersion: version, input: area,
    }));
  }

  async submitTenantProfile(
    authContext: AuthContext,
    input: SubmitTenantServiceProviderProfileInput,
  ) {
    const tenantId = this.requireTenantManager(authContext);
    const mutation = this.requireMutation(await this.repository.submitTenantProfile({
      tenantId, expectedVersion: input.version,
    }));
    await this.recordAudit(authContext, tenantId, mutation.profile.id,
      "service_provider_submit_review", "提交服务商公开资料审核", mutation.profile.version);
    return mutation;
  }

  listPlatformQueue(
    authContext: AuthContext,
    query: TenantServiceProviderPublicationListQuery,
  ) {
    this.requirePlatformPublisher(authContext);
    return this.repository.listPlatformPublicationQueue({
      ...normalizePage(query), status: query.status,
      keyword: query.keyword?.trim() || undefined,
    });
  }

  async getPlatformDetail(authContext: AuthContext, tenantId: string) {
    this.requirePlatformPublisher(authContext);
    const profile = await this.repository.getPlatformPublicationDetail(tenantId);
    if (!profile) throw notFound();
    return profile;
  }

  listPlatformAreas(
    authContext: AuthContext,
    tenantId: string,
    query: TenantServiceProviderAreaListQuery,
  ) {
    this.requirePlatformPublisher(authContext);
    return this.repository.listPlatformPublicationAreas({
      tenantId, ...normalizePage(query),
    });
  }

  publish(
    authContext: AuthContext,
    tenantId: string,
    input: PublishTenantServiceProviderProfileInput,
  ) {
    return this.platformDecision(authContext, tenantId, input,
      "publishProfile", "service_provider_publish", "发布服务商公开资料");
  }

  returnToDraft(
    authContext: AuthContext,
    tenantId: string,
    input: ReturnTenantServiceProviderProfileToDraftInput,
  ) {
    return this.platformDecision(authContext, tenantId, input,
      "returnProfileToDraft", "service_provider_return_draft", "退回服务商公开资料");
  }

  suspend(
    authContext: AuthContext,
    tenantId: string,
    input: SuspendTenantServiceProviderProfileInput,
  ) {
    return this.platformDecision(authContext, tenantId, input,
      "suspendProfile", "service_provider_suspend", "暂停服务商公开展示");
  }

  async listVisitorProviders(
    user: JwtPayload | undefined,
    query: VisitorLocalServiceProviderListQuery,
  ) {
    const visitorId = requireVisitorId(user);
    const pagination = normalizePage(query);
    const context = await this.locationContexts.findLatestActiveForVisitor(visitorId);
    if (!context?.adcode) return emptyPage(pagination);
    const regionCodes = await this.repository.resolveActiveRegionCodes(context.adcode);
    if (regionCodes.length === 0) return emptyPage(pagination);
    return this.repository.listVisitorProviders({ regionCodes, ...pagination });
  }

  private requireTenantManager(authContext: AuthContext) {
    const tenantId = this.accessPolicy.assertTenantContext(authContext);
    this.accessPolicy.assertPermission(authContext, TENANT_PERMISSION);
    if (!tenantId) throw Errors.forbidden();
    return tenantId;
  }

  private requirePlatformPublisher(authContext: AuthContext) {
    if (
      authContext.tenantId !== null ||
      (!authContext.isPlatformStaff && !authContext.isPlatformAdmin) ||
      !authContext.employeeId
    ) {
      throw Errors.forbidden();
    }
    this.accessPolicy.assertPermission(authContext, PLATFORM_PERMISSION);
    return authContext.employeeId;
  }

  private async platformDecision(
    authContext: AuthContext,
    tenantId: string,
    input: PublishTenantServiceProviderProfileInput,
    method: "publishProfile" | "returnProfileToDraft" | "suspendProfile",
    action: "service_provider_publish" | "service_provider_return_draft" | "service_provider_suspend",
    summary: string,
  ) {
    const reviewerEmployeeId = this.requirePlatformPublisher(authContext);
    const mutation = this.requireMutation(await this.repository[method]({
      tenantId, expectedVersion: input.version, reviewerEmployeeId,
      reviewRemark: input.review_remark.trim(),
    }));
    await this.recordAudit(authContext, tenantId, mutation.profile.id,
      action, summary, mutation.profile.version);
    return mutation;
  }

  private requireMutation(result: TenantServiceProviderMutation) {
    if (result.status === "updated") return result;
    if (result.status === "not_found") throw notFound();
    if (result.status === "validation_failed") {
      throw Errors.business(400, "服务商公开资料不完整", "SERVICE_PROVIDER_PROFILE_INVALID");
    }
    throw Errors.business(409, "服务商资料状态或版本已变化，请刷新后重试",
      "SERVICE_PROVIDER_STATE_CONFLICT");
  }

  private recordAudit(
    authContext: AuthContext,
    tenantId: string,
    profileId: string,
    action: "service_provider_submit_review" | "service_provider_publish" |
      "service_provider_return_draft" | "service_provider_suspend",
    summary: string,
    version: number,
  ) {
    return this.audit.recordBestEffort({
      action, actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId, targetTenantId: tenantId,
      resourceType: "tenant_service_provider_profile", resourceId: profileId,
      status: "success", summary, metadata: { version },
    });
  }
}

function requireVisitorId(user?: JwtPayload) {
  if (user?.token_type !== "visitor_session" || !user.visitor_id) {
    throw Errors.unauthorized("请使用 visitor 登录态");
  }
  return user.visitor_id;
}

function normalizePage(query: { page: number; pageSize: number }) {
  return {
    page: Number.isInteger(query.page) && query.page > 0 ? query.page : 1,
    pageSize: Number.isInteger(query.pageSize) && query.pageSize > 0
      ? Math.min(query.pageSize, MAX_PAGE_SIZE) : 20,
  };
}

function emptyPage(pagination: { page: number; pageSize: number }) {
  return { list: [], pagination: { ...pagination, total: 0, totalPages: 0 } };
}

function notFound() {
  return Errors.business(404, "服务商公开资料不存在", "SERVICE_PROVIDER_PROFILE_NOT_FOUND");
}

export const tenantServiceProvidersService = new TenantServiceProvidersService();
