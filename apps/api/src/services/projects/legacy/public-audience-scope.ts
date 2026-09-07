import { Errors } from "@/errors/error-factory";
import {
  userLocationContextRepository,
  type UserLocationMatchedTenant,
} from "@/repositories/user-location-contexts";
import { tenantServiceAreaRepository } from "@/repositories/tenant-service-areas";
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

type ActiveTenantReader = {
  listActiveTenantIds(tenantIds: readonly string[]): Promise<string[]>;
};

export const emptyPublicProjectAudienceScope = (): PublicProjectAudienceScope => ({
  kind: "empty",
  tenantIds: [],
  preferredTenantId: null,
});

export function createPublicProjectAudienceScopeResolver(
  repository: ContextReader,
  activeTenantReader: ActiveTenantReader,
): (payload: JwtPayload | undefined) => Promise<PublicProjectAudienceScope> {
  return async (
    payload: JwtPayload | undefined,
  ): Promise<PublicProjectAudienceScope> => {
    if (payload?.token_type === "auth") {
      return resolveIdentityTenantScope(activeTenantReader, payload);
    }

    if (payload?.token_type === "visitor_session") {
      return resolveVisitorLocationScope(repository, activeTenantReader, payload);
    }

    return emptyPublicProjectAudienceScope();
  };
}

export const resolvePublicProjectAudienceScope =
  createPublicProjectAudienceScopeResolver(
    userLocationContextRepository,
    tenantServiceAreaRepository,
  );

export function assertPublicProjectInAudience(
  scope: PublicProjectAudienceScope,
  tenantId: string | null,
): void {
  if (!tenantId || !scope.tenantIds.includes(tenantId)) {
    throw Errors.notFound("项目不存在");
  }
}

async function resolveIdentityTenantScope(
  activeTenantReader: ActiveTenantReader,
  payload: JwtPayload,
): Promise<PublicProjectAudienceScope> {
  if (!payload.tenant_id) {
    return emptyPublicProjectAudienceScope();
  }

  const tenantIds = await activeTenantReader.listActiveTenantIds([payload.tenant_id]);
  if (!tenantIds.includes(payload.tenant_id)) {
    return emptyPublicProjectAudienceScope();
  }

  return {
    kind: "identity_tenant",
    tenantIds,
    preferredTenantId: payload.tenant_id,
  };
}

async function resolveVisitorLocationScope(
  repository: ContextReader,
  activeTenantReader: ActiveTenantReader,
  payload: JwtPayload,
): Promise<PublicProjectAudienceScope> {
  if (!payload.visitor_id) {
    return emptyPublicProjectAudienceScope();
  }

  const context = await repository.findLatestActiveForVisitor(payload.visitor_id);
  const matchedTenantIds = normalizeTenantIds(context?.matched_tenants ?? []);

  if (matchedTenantIds.length === 0) {
    return emptyPublicProjectAudienceScope();
  }

  const tenantIds = normalizeActiveTenantIds(
    await activeTenantReader.listActiveTenantIds(matchedTenantIds),
    matchedTenantIds,
  );

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

function normalizeActiveTenantIds(
  activeTenantIds: readonly string[],
  matchedTenantIds: readonly string[],
): string[] {
  const matched = new Set(matchedTenantIds);
  return [...new Set(activeTenantIds.filter((tenantId) => matched.has(tenantId)))]
    .sort();
}

function normalizeTenantIds(
  matchedTenants: Array<Pick<UserLocationMatchedTenant, "tenant_id">>,
): string[] {
  return [...new Set(matchedTenants.map((item) => item.tenant_id).filter(Boolean))]
    .sort();
}
