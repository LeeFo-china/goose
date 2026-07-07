import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { SwitchIdentitySchema } from "@/schema/auth-identity-switch";
import { authIdentitySwitchService } from "@/services/auth-identity-switch";
import { ResponseHandler } from "@/utils/response";
import { Get, Post } from "@/utils/decorators/route";
import {
  buildEmployeeLoginContext,
  buildEmployeeLoginContextByEmployeeId,
  buildEmployeeLoginContextFromMembership,
  buildEmployeeLoginResponse,
  buildEmployeeLoginRoles,
  buildVisitorSessionId,
  clearVisitorOnlyAuthUserCache,
  createAuthUserVisitorResponse,
  createVisitorSessionResponse,
  getCachedVisitorOnlyAuthUser,
  getRequiredAuthContext,
  prewarmEmployeeAuthContext,
  prewarmVisitorHomeData,
  resolveMembershipVisitorState,
  runAuthBackgroundTask,
  serializeBackgroundError,
  serializeEmployeeFromAuthContext,
  serializeTenantFromAuthContext,
  setCachedVisitorOnlyAuthUser,
  signVisitorSession,
  signWechatAuthToken,
} from "./wechat-auth-legacy/common";
import { getOpenId } from "./wechat-auth-legacy/login";
import {
  approveWechatRebindRequest,
  createH5MarketingSession,
  createWechatRebindRequest,
  listWechatRebindRequests,
  rejectWechatRebindRequest,
  selectCustomerTenant,
  sendCode,
  unbindCustomerWechat,
  unbindEmployeeWechat,
  verifyRole,
} from "./wechat-auth-legacy/verify-role";
import {
  createWechatVisitorSession,
  createWechatVisitorUser,
  getAuthUserIdForRoleVerification,
  getCustomerTenantOptionById,
  getOrCreateAuthUser,
  getWeChatSession,
  listCustomerTenantOptionsByAuthUser,
  listCustomerTenantOptionsByPhone,
  normalizeTenantRelation,
  serializeCustomerTenantOption,
  signCustomerSession,
  assertCustomerTenantAvailable,
} from "./wechat-auth-legacy/identity";
import {
  bindCustomerRole,
  bindCustomerToAuthUser,
  resolveCustomerLoginState,
  resolveCustomerLoginStateByShareToken,
  selectCustomerTenantForAuthUser,
} from "./wechat-auth-legacy/customer";
import {
  bindEmployeeRole,
  findOpenIdByAuthUserId,
  getAccessToken,
  getJsConfig,
  getOpenIdByAuthUserId,
  getUserRoles,
  verifyServer,
} from "./wechat-auth-legacy/employee";

export class WeChatController extends BaseController {
  private visitorOnlyAuthUserCache = new Map<string, { expiresAt: number }>();

  private serializeTenantFromAuthContext = serializeTenantFromAuthContext;
  private serializeBackgroundError = serializeBackgroundError;
  private runAuthBackgroundTask = runAuthBackgroundTask;
  private prewarmEmployeeAuthContext = prewarmEmployeeAuthContext;
  private prewarmVisitorHomeData = prewarmVisitorHomeData;
  private buildVisitorSessionId = buildVisitorSessionId;
  private signVisitorSession = signVisitorSession;
  private createVisitorSessionResponse = createVisitorSessionResponse;
  private clearVisitorOnlyAuthUserCache = clearVisitorOnlyAuthUserCache;
  private getCachedVisitorOnlyAuthUser = getCachedVisitorOnlyAuthUser;
  private getRequiredAuthContext = getRequiredAuthContext;
  private signWechatAuthToken = signWechatAuthToken;
  private setCachedVisitorOnlyAuthUser = setCachedVisitorOnlyAuthUser;
  private resolveMembershipVisitorState = resolveMembershipVisitorState;
  private createAuthUserVisitorResponse = createAuthUserVisitorResponse;
  private serializeEmployeeFromAuthContext = serializeEmployeeFromAuthContext;
  private buildEmployeeLoginRoles = buildEmployeeLoginRoles;
  private buildEmployeeLoginResponse = buildEmployeeLoginResponse;
  private buildEmployeeLoginContext = buildEmployeeLoginContext;
  private buildEmployeeLoginContextByEmployeeId = buildEmployeeLoginContextByEmployeeId;
  private buildEmployeeLoginContextFromMembership = buildEmployeeLoginContextFromMembership;
  private getAuthUserIdForRoleVerification = getAuthUserIdForRoleVerification;
  private getWeChatSession = getWeChatSession;
  private getOrCreateAuthUser = getOrCreateAuthUser;
  private createWechatVisitorSession = createWechatVisitorSession;
  private createWechatVisitorUser = createWechatVisitorUser;
  private normalizeTenantRelation = normalizeTenantRelation;
  private assertCustomerTenantAvailable = assertCustomerTenantAvailable;
  private listCustomerTenantOptionsByPhone = listCustomerTenantOptionsByPhone;
  private listCustomerTenantOptionsByAuthUser = listCustomerTenantOptionsByAuthUser;
  private getCustomerTenantOptionById = getCustomerTenantOptionById;
  private serializeCustomerTenantOption = serializeCustomerTenantOption;
  private signCustomerSession = signCustomerSession;
  private bindCustomerToAuthUser = bindCustomerToAuthUser;
  private resolveCustomerLoginState = resolveCustomerLoginState;
  private resolveCustomerLoginStateByShareToken = resolveCustomerLoginStateByShareToken;
  private selectCustomerTenantForAuthUser = selectCustomerTenantForAuthUser;
  private bindCustomerRole = bindCustomerRole;
  private bindEmployeeRole = bindEmployeeRole;
  private findOpenIdByAuthUserId = findOpenIdByAuthUserId;
  private getOpenIdByAuthUserId = getOpenIdByAuthUserId;
  private getUserRoles = getUserRoles;

  constructor() {
    super("wechat");
  }

  @Post("/auth")
  async getOpenId(request: FastifyRequest, reply: FastifyReply) {
    return getOpenId.call(this, request, reply);
  }

  @Post("/auth/send-code")
  async sendCode(request: FastifyRequest, reply: FastifyReply) {
    return sendCode.call(this, request, reply);
  }

  @Post("/auth/verify-role")
  async verifyRole(request: FastifyRequest, reply: FastifyReply) {
    return verifyRole.call(this, request, reply);
  }

  @Get("/auth/identities")
  async listIdentityOptions(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = await this.getAuthUserIdForRoleVerification(request);
    const data = await authIdentitySwitchService.listOptions({
      ...request.user,
      sub: authUserId,
    });

    return reply.send(ResponseHandler.success(data));
  }

  @Post("/auth/switch")
  async switchIdentity(request: FastifyRequest, reply: FastifyReply) {
    const parsed = SwitchIdentitySchema.safeParse(request.body);
    if (!parsed.success) {
      throw Errors.fromZod(parsed.error);
    }

    const authUserId = await this.getAuthUserIdForRoleVerification(request);
    const data = await authIdentitySwitchService.switchIdentity(
      {
        ...request.user,
        sub: authUserId,
      },
      parsed.data,
    );

    return reply.send(ResponseHandler.success(data));
  }

  @Post("/auth/switch/visitor")
  async switchToVisitor(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = await this.getAuthUserIdForRoleVerification(request);
    const data = await authIdentitySwitchService.switchIdentity(
      {
        ...request.user,
        sub: authUserId,
      },
      { target_mode: "platform_visitor" },
    );

    return reply.send(ResponseHandler.success(data));
  }

  @Post("/customer/auth/select-tenant")
  async selectCustomerTenant(request: FastifyRequest, reply: FastifyReply) {
    return selectCustomerTenant.call(this, request, reply);
  }

  @Post("/customer/auth/unbind-wechat")
  async unbindCustomerWechat(request: FastifyRequest, reply: FastifyReply) {
    return unbindCustomerWechat.call(this, request, reply);
  }

  @Post("/employee/auth/unbind-wechat")
  async unbindEmployeeWechat(request: FastifyRequest, reply: FastifyReply) {
    return unbindEmployeeWechat.call(this, request, reply);
  }

  @Post("/auth/wechat-rebind-requests")
  async createWechatRebindRequest(request: FastifyRequest, reply: FastifyReply) {
    return createWechatRebindRequest.call(this, request, reply);
  }

  @Get("/employee/auth/wechat-rebind-requests")
  async listWechatRebindRequests(request: FastifyRequest, reply: FastifyReply) {
    return listWechatRebindRequests.call(this, request, reply);
  }

  @Post("/employee/auth/wechat-rebind-requests/:id/approve")
  async approveWechatRebindRequest(request: FastifyRequest, reply: FastifyReply) {
    return approveWechatRebindRequest.call(this, request, reply);
  }

  @Post("/employee/auth/wechat-rebind-requests/:id/reject")
  async rejectWechatRebindRequest(request: FastifyRequest, reply: FastifyReply) {
    return rejectWechatRebindRequest.call(this, request, reply);
  }

  @Post("/wechat/h5-session")
  async createH5MarketingSession(request: FastifyRequest, reply: FastifyReply) {
    return createH5MarketingSession.call(this, request, reply);
  }

  async verifyServer(request: FastifyRequest, reply: FastifyReply) {
    return verifyServer.call(this, request, reply);
  }

  async getAccessToken() {
    return getAccessToken.call(this);
  }

  async getJsConfig(request: FastifyRequest, reply: FastifyReply) {
    return getJsConfig.call(this, request, reply);
  }
}

export default new WeChatController();
