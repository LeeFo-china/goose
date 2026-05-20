import { createHash } from "node:crypto";
import {
  userIdentityRepository,
  type BusinessIdentityType,
  type OAuthPlatform,
  type UserBusinessMembershipRecord,
  type UserOAuthIdentityRecord,
} from "@/repositories/user-identities";

const IDENTITY_LOOKUP_CACHE_TTL_MS = 10_000;
const MAX_IDENTITY_LOOKUP_CACHE_SIZE = 4_000;

type BusinessMembershipSyncInput = {
  userId: string;
  tenantId: string | null;
  identityType: BusinessIdentityType;
  identityId: string;
  isDefault?: boolean;
  deactivateOtherSameType?: boolean;
  source: string;
};

class UserIdentityService {
  private activeOauthCache = new Map<string, {
    expiresAt: number;
    value: UserOAuthIdentityRecord | null;
  }>();
  private activeOauthInFlight = new Map<string, Promise<UserOAuthIdentityRecord | null>>();
  private activeMembershipsCache = new Map<string, {
    expiresAt: number;
    value: UserBusinessMembershipRecord[];
  }>();
  private activeMembershipsInFlight = new Map<string, Promise<UserBusinessMembershipRecord[]>>();

  private hashOpenid(openid?: string | null) {
    if (!openid) return null;
    return createHash("sha256").update(openid).digest("hex");
  }

  private getCacheValue<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string) {
    const item = cache.get(key);
    if (!item) {
      return null;
    }

    if (item.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }

    return item.value;
  }

  private setCacheValue<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string, value: T) {
    const now = Date.now();
    if (cache.size >= MAX_IDENTITY_LOOKUP_CACHE_SIZE) {
      for (const [cacheKey, item] of cache.entries()) {
        if (item.expiresAt <= now) {
          cache.delete(cacheKey);
        }
      }

      if (cache.size >= MAX_IDENTITY_LOOKUP_CACHE_SIZE) {
        cache.clear();
      }
    }

    cache.set(key, {
      expiresAt: now + IDENTITY_LOOKUP_CACHE_TTL_MS,
      value,
    });
  }

  private oauthCacheKey(platform: OAuthPlatform, openid: string) {
    return `${platform}:${openid}`;
  }

  private membershipsCacheKey(userId: string) {
    return userId;
  }

  private clearOauthCache(input: {
    platform?: OAuthPlatform | null;
    openid?: string | null;
    userId?: string | null;
  }) {
    if (input.platform && input.openid) {
      const cacheKey = this.oauthCacheKey(input.platform, input.openid);
      this.activeOauthCache.delete(cacheKey);
      this.activeOauthInFlight.delete(cacheKey);
    }

    if (!input.userId && !input.platform) {
      return;
    }

    for (const [key, item] of this.activeOauthCache.entries()) {
      if (
        (!input.platform || key.startsWith(`${input.platform}:`)) &&
        (!input.userId || item.value?.user_id === input.userId)
      ) {
        this.activeOauthCache.delete(key);
        this.activeOauthInFlight.delete(key);
      }
    }
  }

  private clearMembershipsCache(userId?: string | null) {
    if (!userId) {
      return;
    }

    const cacheKey = this.membershipsCacheKey(userId);
    this.activeMembershipsCache.delete(cacheKey);
    this.activeMembershipsInFlight.delete(cacheKey);
  }

  private membershipKey(input: {
    tenant_id: string | null;
    identity_type: string;
    identity_id: string;
  }) {
    return `${input.identity_type}:${input.tenant_id ?? "global"}:${input.identity_id}`;
  }

  private async recordEventBestEffort(input: {
    userId?: string | null;
    eventType: string;
    platform?: OAuthPlatform | null;
    openid?: string | null;
    operatorUserId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await userIdentityRepository.recordAuthEvent({
        userId: input.userId ?? null,
        eventType: input.eventType,
        platform: input.platform ?? null,
        openidHash: this.hashOpenid(input.openid),
        operatorUserId: input.operatorUserId ?? null,
        metadata: input.metadata ?? {},
      });
    } catch {
      // 身份事件用于排查，不能影响登录和绑定主链路。
    }
  }

  async syncOauthIdentityBestEffort(input: {
    userId: string;
    platform: OAuthPlatform;
    openid: string;
    unionid?: string | null;
    source: string;
  }) {
    this.clearOauthCache(input);
    try {
      const existing = await userIdentityRepository.findActiveOauthIdentity(
        input.platform,
        input.openid,
      );

      if (existing) {
        if (existing.user_id !== input.userId || existing.unionid !== (input.unionid ?? null)) {
          await userIdentityRepository.updateOauthIdentity({
            id: existing.id,
            userId: input.userId,
            unionid: input.unionid ?? null,
          });
          this.clearOauthCache(input);
        }
        this.setCacheValue(
          this.activeOauthCache,
          this.oauthCacheKey(input.platform, input.openid),
          {
            ...existing,
            user_id: input.userId,
            unionid: input.unionid ?? null,
            status: "active",
            unbound_at: null,
          },
        );
        return;
      }

      const created = await userIdentityRepository.createOauthIdentity({
        userId: input.userId,
        platform: input.platform,
        openid: input.openid,
        unionid: input.unionid ?? null,
      });
      this.setCacheValue(
        this.activeOauthCache,
        this.oauthCacheKey(input.platform, input.openid),
        created,
      );
    } catch (error) {
      this.clearOauthCache(input);
      await this.recordEventBestEffort({
        userId: input.userId,
        eventType: "identity_oauth_dual_write_failed",
        platform: input.platform,
        openid: input.openid,
        metadata: {
          source: input.source,
          error: this.serializeError(error),
        },
      });
    }
  }

  async findActiveOauthIdentity(input: {
    platform: OAuthPlatform;
    openid: string;
  }) {
    const cacheKey = this.oauthCacheKey(input.platform, input.openid);
    const cached = this.getCacheValue(this.activeOauthCache, cacheKey);
    if (cached) {
      return cached;
    }

    const inFlight = this.activeOauthInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = userIdentityRepository.findActiveOauthIdentity(
      input.platform,
      input.openid,
    ).then((identity) => {
      if (identity) {
        this.setCacheValue(this.activeOauthCache, cacheKey, identity);
      }
      return identity;
    }).finally(() => {
      if (this.activeOauthInFlight.get(cacheKey) === request) {
        this.activeOauthInFlight.delete(cacheKey);
      }
    });
    this.activeOauthInFlight.set(cacheKey, request);
    const identity = await request;
    if (identity) {
      this.setCacheValue(this.activeOauthCache, cacheKey, identity);
    }
    return identity;
  }

  async unbindOauthIdentityBestEffort(input: {
    userId: string;
    platform: OAuthPlatform;
    openid?: string | null;
    source: string;
  }) {
    this.clearOauthCache(input);
    try {
      await userIdentityRepository.unbindOauthIdentities({
        userId: input.userId,
        platform: input.platform,
        openid: input.openid ?? null,
      });
      await this.recordEventBestEffort({
        userId: input.userId,
        eventType: "identity_oauth_unbound",
        platform: input.platform,
        openid: input.openid ?? null,
        metadata: {
          source: input.source,
        },
      });
      this.clearOauthCache(input);
    } catch (error) {
      this.clearOauthCache(input);
      await this.recordEventBestEffort({
        userId: input.userId,
        eventType: "identity_oauth_unbind_failed",
        platform: input.platform,
        metadata: {
          source: input.source,
          error: this.serializeError(error),
        },
      });
    }
  }

  async isOauthIdentityUnbound(input: {
    userId: string;
    platform: OAuthPlatform;
    openid: string;
  }) {
    const identity = await userIdentityRepository.findUnboundOauthIdentity(input);
    return Boolean(identity);
  }

  async listActiveBusinessMemberships(input: {
    userId: string;
    identityType?: BusinessIdentityType;
  }) {
    const cacheKey = this.membershipsCacheKey(input.userId);
    let memberships = this.getCacheValue(this.activeMembershipsCache, cacheKey);
    if (!memberships) {
      const inFlight = this.activeMembershipsInFlight.get(cacheKey);
      if (inFlight) {
        memberships = await inFlight;
      } else {
        const request = userIdentityRepository.listBusinessMemberships(input.userId)
          .then((records) => {
            const activeMemberships = records
              .filter((item) => item.status === "active")
              .sort((a, b) => Number(b.is_default) - Number(a.is_default));
            this.setCacheValue(this.activeMembershipsCache, cacheKey, activeMemberships);
            return activeMemberships;
          })
          .finally(() => {
            if (this.activeMembershipsInFlight.get(cacheKey) === request) {
              this.activeMembershipsInFlight.delete(cacheKey);
            }
          });
        this.activeMembershipsInFlight.set(cacheKey, request);
        memberships = await request;
      }
    }

    return memberships.filter((item) => (
      !input.identityType || item.identity_type === input.identityType
    ));
  }

  async hasActiveBusinessMembership(input: {
    userId: string;
    tenantId: string | null;
    identityType: BusinessIdentityType;
    identityId: string;
  }) {
    const memberships = await this.listActiveBusinessMemberships({
      userId: input.userId,
      identityType: input.identityType,
    });

    return memberships.some((item) => (
      item.identity_id === input.identityId &&
      item.tenant_id === input.tenantId
    ));
  }

  async syncBusinessMembershipBestEffort(input: BusinessMembershipSyncInput) {
    this.clearMembershipsCache(input.userId);
    if (!input.tenantId) {
      await this.recordEventBestEffort({
        userId: input.userId,
        eventType: "identity_membership_dual_write_skipped",
        metadata: {
          source: input.source,
          reason: "tenant_id_missing",
          identity_type: input.identityType,
          identity_id: input.identityId,
        },
      });
      return;
    }

    try {
      if (input.deactivateOtherSameType) {
        await userIdentityRepository.deactivateOtherMemberships({
          userId: input.userId,
          identityType: input.identityType,
          keepIdentityId: input.identityId,
        });
      }

      const existing = await userIdentityRepository.findBusinessMembership({
        userId: input.userId,
        tenantId: input.tenantId,
        identityType: input.identityType,
        identityId: input.identityId,
      });

      if (existing) {
        await userIdentityRepository.updateBusinessMembership({
          id: existing.id,
          status: "active",
          isDefault: input.isDefault ?? true,
        });
        this.clearMembershipsCache(input.userId);
        return;
      }

      await userIdentityRepository.createBusinessMembership({
        userId: input.userId,
        tenantId: input.tenantId,
        identityType: input.identityType,
        identityId: input.identityId,
        status: "active",
        isDefault: input.isDefault ?? true,
      });
      this.clearMembershipsCache(input.userId);
    } catch (error) {
      this.clearMembershipsCache(input.userId);
      await this.recordEventBestEffort({
        userId: input.userId,
        eventType: "identity_membership_dual_write_failed",
        metadata: {
          source: input.source,
          tenant_id: input.tenantId,
          identity_type: input.identityType,
          identity_id: input.identityId,
          error: this.serializeError(error),
        },
      });
    }
  }

  async unbindBusinessMembershipBestEffort(input: {
    userId: string;
    tenantId: string | null;
    identityType: BusinessIdentityType;
    identityId: string;
    source: string;
  }) {
    if (!input.tenantId) {
      return;
    }

    this.clearMembershipsCache(input.userId);
    try {
      await userIdentityRepository.unbindBusinessMembership({
        userId: input.userId,
        tenantId: input.tenantId,
        identityType: input.identityType,
        identityId: input.identityId,
      });
      this.clearMembershipsCache(input.userId);
    } catch (error) {
      this.clearMembershipsCache(input.userId);
      await this.recordEventBestEffort({
        userId: input.userId,
        eventType: "identity_membership_unbind_failed",
        metadata: {
          source: input.source,
          tenant_id: input.tenantId,
          identity_type: input.identityType,
          identity_id: input.identityId,
          error: this.serializeError(error),
        },
      });
    }
  }

  async transferBusinessMembershipBestEffort(input: {
    oldUserId: string | null;
    newUserId: string;
    tenantId: string | null;
    identityType: BusinessIdentityType;
    identityId: string;
    source: string;
  }) {
    if (input.oldUserId) {
      await this.unbindBusinessMembershipBestEffort({
        userId: input.oldUserId,
        tenantId: input.tenantId,
        identityType: input.identityType,
        identityId: input.identityId,
        source: input.source,
      });
    }

    await this.syncBusinessMembershipBestEffort({
      userId: input.newUserId,
      tenantId: input.tenantId,
      identityType: input.identityType,
      identityId: input.identityId,
      source: input.source,
    });
  }

  async observeLegacyIdentityStateBestEffort(input: {
    userId: string;
    openid?: string | null;
    unionid?: string | null;
    source: string;
  }) {
    try {
      if (input.openid) {
        const oauth = await userIdentityRepository.findActiveOauthIdentity(
          "wechat_mini",
          input.openid,
        );
        if (!oauth || oauth.user_id !== input.userId) {
          await this.recordEventBestEffort({
            userId: input.userId,
            eventType: "identity_oauth_mismatch",
            platform: "wechat_mini",
            openid: input.openid,
            metadata: {
              source: input.source,
              expected_user_id: input.userId,
              actual_user_id: oauth?.user_id ?? null,
              actual_identity_id: oauth?.id ?? null,
            },
          });
        }
      }

      const [legacyCustomers, legacyEmployees, memberships] = await Promise.all([
        userIdentityRepository.listLegacyCustomerBindings(input.userId),
        userIdentityRepository.listLegacyEmployeeBindings(input.userId),
        userIdentityRepository.listBusinessMemberships(input.userId),
      ]);

      const legacyKeys = new Set<string>();
      for (const customer of legacyCustomers) {
        if (!customer.tenant_id) continue;
        legacyKeys.add(this.membershipKey({
          tenant_id: customer.tenant_id,
          identity_type: "customer",
          identity_id: customer.id,
        }));
      }

      for (const employee of legacyEmployees) {
        if (!employee.tenant_id) continue;
        legacyKeys.add(this.membershipKey({
          tenant_id: employee.tenant_id,
          identity_type: "employee",
          identity_id: employee.id,
        }));
      }

      const membershipKeys = new Set(
        memberships.map((item) => this.membershipKey(item)),
      );

      const missingMemberships = Array.from(legacyKeys)
        .filter((key) => !membershipKeys.has(key));
      const orphanMemberships = this.findOrphanMemberships(memberships, legacyKeys);

      if (missingMemberships.length > 0 || orphanMemberships.length > 0) {
        await this.recordEventBestEffort({
          userId: input.userId,
          eventType: "identity_membership_mismatch",
          platform: input.openid ? "wechat_mini" : null,
          openid: input.openid ?? null,
          metadata: {
            source: input.source,
            missing_memberships: missingMemberships,
            orphan_memberships: orphanMemberships.map((item) => ({
              id: item.id,
              tenant_id: item.tenant_id,
              identity_type: item.identity_type,
              identity_id: item.identity_id,
            })),
          },
        });
      }
    } catch (error) {
      await this.recordEventBestEffort({
        userId: input.userId,
        eventType: "identity_observe_failed",
        platform: input.openid ? "wechat_mini" : null,
        openid: input.openid ?? null,
        metadata: {
          source: input.source,
          error: this.serializeError(error),
        },
      });
    }
  }

  private findOrphanMemberships(
    memberships: UserBusinessMembershipRecord[],
    legacyKeys: Set<string>,
  ) {
    return memberships.filter((item) => (
      item.status === "active" && !legacyKeys.has(this.membershipKey(item))
    ));
  }

  private serializeError(error: unknown) {
    if (!error || typeof error !== "object") {
      return String(error);
    }

    return {
      name: "name" in error ? error.name : undefined,
      message: "message" in error ? error.message : undefined,
      code: "code" in error ? error.code : undefined,
    };
  }
}

export const userIdentityService = new UserIdentityService();
