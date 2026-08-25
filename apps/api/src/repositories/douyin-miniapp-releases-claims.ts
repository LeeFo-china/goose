import type { DouyinMiniappReleaseStatus } from "./douyin-miniapp-releases";

export const DOUYIN_MINIAPP_RELEASE_OPERATIONS = [
  "upload", "test_qr", "audit_qr", "submit_audit", "sync_status", "publish",
] as const;

export type DouyinMiniappReleaseOperation =
  (typeof DOUYIN_MINIAPP_RELEASE_OPERATIONS)[number];

export type ClaimDouyinMiniappReleaseOperationInput = {
  readonly releaseId: string;
  readonly expectedStatuses: readonly DouyinMiniappReleaseStatus[];
  readonly operationName: DouyinMiniappReleaseOperation;
  readonly claimToken: string;
  readonly claimExpiresAt: string;
  readonly platformOperatorId: string;
};

export type DouyinMiniappReleaseOperationClaim = {
  readonly releaseId: string;
  readonly claimToken: string;
  readonly claimExpiresAt: string;
  readonly recoveryRequired: boolean;
};
