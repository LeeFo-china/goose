import {
  APPLYMENT_STAGE_KEYS,
  canLeaveMaterialsStage,
  canLeaveRecognitionStage,
  type ApplymentMaterialStateMap,
  type ApplymentStageKey,
} from "./finance-wechat-pay-applyment-flow-model";
import type { WechatPayApplymentAttachment } from "./finance-wechat-pay-applyment-shared";

type ReachabilityInput = {
  contactType: string;
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
};

export function isApplymentStageReachable(
  stage: ApplymentStageKey,
  reachableStage: ApplymentStageKey,
): boolean {
  return APPLYMENT_STAGE_KEYS.indexOf(stage) <=
    APPLYMENT_STAGE_KEYS.indexOf(reachableStage);
}

export function getReachableStage(
  input: ReachabilityInput & {
    unlockedStage: ApplymentStageKey;
    supplementValid: boolean;
  },
): ApplymentStageKey {
  let guardCap: ApplymentStageKey = "submit";
  if (!canLeaveMaterialsStage(input).allowed) {
    guardCap = "materials";
  } else if (!canLeaveRecognitionStage(input).allowed) {
    guardCap = "recognition";
  } else if (!input.supplementValid) {
    guardCap = "supplement";
  }

  return APPLYMENT_STAGE_KEYS[
    Math.min(
      APPLYMENT_STAGE_KEYS.indexOf(input.unlockedStage),
      APPLYMENT_STAGE_KEYS.indexOf(guardCap),
    )
  ];
}

export function getInitialApplymentStage(
  input: ReachabilityInput & {
    blockerStages: readonly ApplymentStageKey[];
  },
): ApplymentStageKey {
  const blockerStages = new Set(input.blockerStages);
  const reachableStage = getReachableStage({
    ...input,
    unlockedStage: "submit",
    supplementValid: !blockerStages.has("supplement"),
  });
  if (blockerStages.has("materials")) return "materials";
  if (
    blockerStages.has("recognition") &&
    isApplymentStageReachable("recognition", reachableStage)
  ) {
    return "recognition";
  }
  return reachableStage;
}
