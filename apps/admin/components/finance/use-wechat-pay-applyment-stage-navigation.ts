"use client";

import {
  type FormEvent,
  type RefObject,
  useEffect,
  useState,
} from "react";

import {
  APPLYMENT_STAGE_KEYS,
  canLeaveMaterialsStage,
  canLeaveRecognitionStage,
  type ApplymentMaterialStateMap,
  type ApplymentStageKey,
} from "./finance-wechat-pay-applyment-flow-model";
import {
  getReachableStage,
  isApplymentStageReachable,
} from "./finance-wechat-pay-applyment-stage-reachability";
import type {
  WechatPayApplymentAttachment,
  WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";
import {
  isStageValid,
  validateStage,
} from "./finance-wechat-pay-applyment-validation";

export function useWechatPayApplymentStageNavigation(input: {
  formRef: RefObject<HTMLFormElement | null>;
  resetKey: string;
  initialStage: ApplymentStageKey;
  contactType: string;
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
  activateOcrCategory: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void;
}) {
  const [activeStage, setActiveStage] = useState(input.initialStage);
  const [unlockedStage, setUnlockedStage] = useState(input.initialStage);
  const [formRevision, setFormRevision] = useState(0);
  const [stageError, setStageError] = useState("");
  const supplementValid = input.formRef.current
    ? isStageValid(input.formRef.current, "supplement")
    : true;
  void formRevision;
  const reachableStage = getReachableStage({
    unlockedStage,
    contactType: input.contactType,
    attachments: input.attachments,
    materialStates: input.materialStates,
    supplementValid,
  });
  const displayedStage = isApplymentStageReachable(
      activeStage,
      reachableStage,
    )
    ? activeStage
    : reachableStage;

  useEffect(() => {
    setActiveStage(input.initialStage);
    setUnlockedStage(input.initialStage);
    setStageError("");
    setFormRevision((revision) => revision + 1);
  }, [input.resetKey]);

  useEffect(() => {
    if (displayedStage !== activeStage) setActiveStage(displayedStage);
  }, [activeStage, displayedStage]);

  function handleFormChange(_event: FormEvent<HTMLFormElement>) {
    setFormRevision((revision) => revision + 1);
  }

  function requestStageChange(stage: ApplymentStageKey) {
    const currentReachableStage = getCurrentReachableStage();
    if (!isApplymentStageReachable(stage, currentReachableStage)) {
      revealBlockedStage(stage, currentReachableStage);
      return;
    }
    setStageError("");
    setActiveStage(stage);
  }

  function handleNextStage() {
    const activeIndex = APPLYMENT_STAGE_KEYS.indexOf(displayedStage);
    const nextStage = APPLYMENT_STAGE_KEYS[activeIndex + 1];
    if (!nextStage) return;
    if (!canLeaveCurrentStage(displayedStage)) return;
    setStageError("");
    setActiveStage(nextStage);
    setUnlockedStage((current) =>
      APPLYMENT_STAGE_KEYS.indexOf(nextStage) >
          APPLYMENT_STAGE_KEYS.indexOf(current)
        ? nextStage
        : current
    );
    setFormRevision((revision) => revision + 1);
  }

  function getCurrentReachableStage() {
    return getReachableStage({
      unlockedStage,
      contactType: input.contactType,
      attachments: input.attachments,
      materialStates: input.materialStates,
      supplementValid: input.formRef.current
        ? isStageValid(input.formRef.current, "supplement")
        : supplementValid,
    });
  }

  function canLeaveCurrentStage(stage: ApplymentStageKey) {
    if (stage === "materials") {
      const result = canLeaveMaterialsStage(input);
      if (!result.allowed) setStageError(result.reason);
      return result.allowed;
    }
    if (stage === "recognition") {
      const result = canLeaveRecognitionStage(input);
      if (!result.allowed) setStageError(result.reason);
      return result.allowed;
    }
    if (stage === "supplement") return validateSupplement();
    return false;
  }

  function revealBlockedStage(
    requestedStage: ApplymentStageKey,
    currentReachableStage: ApplymentStageKey,
  ) {
    if (
      requestedStage === "submit" &&
      currentReachableStage === "supplement"
    ) {
      validateSupplement();
      return;
    }
    const materialResult = canLeaveMaterialsStage(input);
    if (!materialResult.allowed) {
      setStageError(materialResult.reason);
      return;
    }
    const recognitionResult = canLeaveRecognitionStage(input);
    setStageError(
      recognitionResult.allowed
        ? "请按顺序完成当前阶段"
        : recognitionResult.reason,
    );
  }

  function validateSupplement() {
    const form = input.formRef.current;
    if (!form) return false;
    const valid = validateStage(
      form,
      "supplement",
      setActiveStage,
      input.activateOcrCategory,
    );
    if (!valid) setFormRevision((revision) => revision + 1);
    return valid;
  }

  return {
    activeStage: displayedStage,
    reachableStage,
    stageError,
    activateStage: setActiveStage,
    handleFormChange,
    requestStageChange,
    handleNextStage,
  };
}
