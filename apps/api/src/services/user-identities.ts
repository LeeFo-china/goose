import { createHash } from "node:crypto";
import {
  userIdentityRepository,
  type BusinessIdentityType,
  type OAuthPlatform,
  type UserBusinessMembershipRecord,
} from "@/repositories/user-identities";

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
  private hashOpenid(openid?: string | null) {
    if (!openid) return null;
    return createHash("sha256").update(openid).digest("hex");
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
        }
        return;
      }

      await userIdentityRepository.createOauthIdentity({
        userId: input.userId,
        platform: input.platform,
        openid: input.openid,
        unionid: input.unionid ?? null,
      });
    } catch (error) {
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

  async syncBusinessMembershipBestEffort(input: BusinessMembershipSyncInput) {
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
    } catch (error) {
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

    try {
      await userIdentityRepository.unbindBusinessMembership({
        userId: input.userId,
        tenantId: input.tenantId,
        identityType: input.identityType,
        identityId: input.identityId,
      });
    } catch (error) {
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
