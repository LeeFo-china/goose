import { Errors } from "@/errors/error-factory";
import {
  userLocationContextRepository,
  type UserLocationMatchedTenant,
} from "@/repositories/user-location-contexts";
import type { JwtPayload } from "@/utils/jwt";

export type PublicProjectAudienceScope = {
  kind: "visitor_location" | "identity_tenant" | "empty";
  tenantIds: string[];
  preferredTenantId: string | null;
};

type VisitorLocationContext = {
  matched_tenants: Array<Pick<UserLocationMatchedTenant, "tenant_id">>;
  selected_tenant_id: string | null;
};

type ContextReader = {
  findLatestActiveForVisitor(
    visitorId: string,
  ): Promise<VisitorLocationContext | null>;
};

export const emptyPublicProjectAudienceScope = (): PublicProjectAudienceScope => ({
  kind: "empty",
  tenantIds: [],
  preferredTenantId: null,
});

export function createPublicProjectAudienceScopeResolver(
  repository: ContextReader,
): (payload: JwtPayload | undefined) => Promise<PublicProjectAudienceScope> {
  return async (
    payload: JwtPayload | undefined,
  ): Promise<PublicProjectAudienceScope> => {
    if (payload?.token_type === "auth") {
      return resolveIdentityTenantScope(payload);
    }

    if (payload?.token_type === "visitor_session") {
      return resolveVisitorLocationScope(repository, payload);
    }

    return emptyPublicProjectAudienceScope();
  };
}

export const resolvePublicProjectAudienceScope =
  createPublicProjectAudienceScopeResolver(userLocationContextRepository);

export function assertPublicProjectInAudience(
  scope: PublicProjectAudienceScope,
  tenantId: string | null,
): void {
  if (!tenantId || !scope.tenantIds.includes(tenantId)) {
    throw Errors.notFound("项目不存在");
  }
}

function resolveIdentityTenantScope(
  payload: JwtPayload,
): PublicProjectAudienceScope {
  if (!payload.tenant_id) {
    return emptyPublicProjectAudienceScope();
  }

  return {
    kind: "identity_tenant",
    tenantIds: [payload.tenant_id],
    preferredTenantId: payload.tenant_id,
  };
}

async function resolveVisitorLocationScope(
  repository: ContextReader,
  payload: JwtPayload,
): Promise<PublicProjectAudienceScope> {
  if (!payload.visitor_id) {
    return emptyPublicProjectAudienceScope();
  }

  const context = await repository.findLatestActiveForVisitor(payload.visitor_id);
  const tenantIds = normalizeTenantIds(context?.matched_tenants ?? []);

  if (tenantIds.length === 0) {
    return emptyPublicProjectAudienceScope();
  }

  const selectedTenantId = context?.selected_tenant_id ?? null;

  return {
    kind: "visitor_location",
    tenantIds,
    preferredTenantId: selectedTenantId && tenantIds.includes(selectedTenantId)
      ? selectedTenantId
      : null,
  };
}

function normalizeTenantIds(
  matchedTenants: Array<Pick<UserLocationMatchedTenant, "tenant_id">>,
): string[] {
  return [...new Set(matchedTenants.map((item) => item.tenant_id).filter(Boolean))]
    .sort();
}
