import { Errors } from "@/errors/error-factory";
import { externalReferrerRepository } from "@/repositories/external-referrers";
import type {
  CreateExternalReferrerInput,
  ExternalReferrerListQueryType,
  UpdateExternalReferrerInput,
} from "@/schema/project-referrals";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

class ExternalReferrerService {
  private requireTenant(authContext: AuthContext) {
    return accessPolicyService.assertTenantContext(authContext);
  }

  async listReferrers(
    authContext: AuthContext,
    params: ExternalReferrerListQueryType,
  ) {
    const tenantId = this.requireTenant(authContext);
    accessPolicyService.assertPermission(authContext, "project_referral.read");
    return externalReferrerRepository.list(params, tenantId);
  }

  async getReferrerById(authContext: AuthContext, id: string) {
    const tenantId = this.requireTenant(authContext);
    accessPolicyService.assertPermission(authContext, "project_referral.read");
    const data = await externalReferrerRepository.findById(id, tenantId);
    if (!data) {
      throw Errors.badRequest("外部介绍人不存在");
    }

    return data;
  }

  async createReferrer(
    authContext: AuthContext,
    input: CreateExternalReferrerInput,
  ) {
    const tenantId = this.requireTenant(authContext);
    accessPolicyService.assertPermission(authContext, "project_referral.manage");
    return externalReferrerRepository.create(input, tenantId);
  }

  async updateReferrer(
    authContext: AuthContext,
    id: string,
    input: UpdateExternalReferrerInput,
  ) {
    const tenantId = this.requireTenant(authContext);
    accessPolicyService.assertPermission(authContext, "project_referral.manage");
    return externalReferrerRepository.update(id, input, tenantId);
  }
}

export const externalReferrerService = new ExternalReferrerService();
