import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import type { TenantOnboardingActiveInviteCode } from "@/repositories/tenant-onboarding";
import type { TenantOnboardingSourceChannel } from "@/schema/tenant-onboarding";
import type { TenantOnboardingPartnerResolution } from "./tenant-onboarding-region-match";

type InviteCodePort = {
  findActiveInviteCodeByCode(code: string): Promise<TenantOnboardingActiveInviteCode | null>;
};

type ResolverPort = {
  resolve(input: {
    serviceRegionCodes: readonly string[];
    inviteCode: string | null;
  }): Promise<TenantOnboardingPartnerResolution>;
};

export async function resolveTenantOnboardingSubmissionPartner(input: {
  serviceRegionCodes: readonly string[];
  submittedInviteCode: string | null | undefined;
  sourceChannel: TenantOnboardingSourceChannel;
  inviteCodeRepository: InviteCodePort;
  regionResolver: ResolverPort;
}) {
  const submittedCode = input.submittedInviteCode?.trim().toUpperCase() || null;
  const provenance = submittedCode
    ? await input.inviteCodeRepository.findActiveInviteCodeByCode(submittedCode)
    : null;
  const firstResolution = await input.regionResolver.resolve({
    serviceRegionCodes: input.serviceRegionCodes,
    inviteCode: provenance?.code ?? null,
  });
  const selected = firstResolution.selectedPartner;
  const inviteMatches = provenance !== null && selected !== null &&
    firstResolution.reason === "invite_code" &&
    provenance.partner_id === selected.id;

  if (inviteMatches) {
    return { resolution: firstResolution, inviteCodeId: provenance.id };
  }

  const resolution = provenance || firstResolution.reason === "invite_code"
    ? await input.regionResolver.resolve({
      serviceRegionCodes: input.serviceRegionCodes,
      inviteCode: null,
    })
    : firstResolution;
  if (input.sourceChannel === "partner_invite") {
    throw Errors.business(
      400,
      "邀请码无效或已变更，请重新获取",
      ErrorCodes.TENANT_ONBOARDING_INVITE_INVALID,
    );
  }
  return { resolution, inviteCodeId: null };
}
