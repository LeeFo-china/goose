import {
  APPLYMENT_OCR_REVIEW_CATEGORIES,
} from "./finance-wechat-pay-applyment-recognized-fields";
import type {
  ApplymentStageKey,
} from "./finance-wechat-pay-applyment-flow-model";
import type {
  WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";

type InvalidControlTarget = {
  stage?: string;
  ocrCategory?: string;
  focus: () => void;
};

export function revealInvalidApplymentControl(input: {
  control: InvalidControlTarget;
  activateStage: (stage: ApplymentStageKey) => void;
  activateOcrCategory: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void;
  reportValidity: () => void;
  schedule: (callback: () => void) => void;
}) {
  activateInvalidApplymentControl(input);
  input.schedule(() => {
    input.control.focus();
    input.reportValidity();
  });
  return false;
}

export function activateInvalidApplymentControl(input: {
  control: Pick<InvalidControlTarget, "stage" | "ocrCategory">;
  activateStage: (stage: ApplymentStageKey) => void;
  activateOcrCategory: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void;
}) {
  if (isApplymentStage(input.control.stage)) {
    input.activateStage(input.control.stage);
  }
  if (isOcrReviewCategory(input.control.ocrCategory)) {
    input.activateOcrCategory(input.control.ocrCategory);
  }
}

export function activateInvalidApplymentElement(
  control: HTMLElement,
  activateStage: (stage: ApplymentStageKey) => void,
  activateOcrCategory: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void,
) {
  activateInvalidApplymentControl({
    control: {
      stage: getApplymentStage(control),
      ocrCategory: control.closest<HTMLElement>("[data-ocr-category]")
        ?.dataset.ocrCategory,
    },
    activateStage,
    activateOcrCategory,
  });
}

export function validateStage(
  form: HTMLFormElement,
  stage: ApplymentStageKey,
  activateStage: (stage: ApplymentStageKey) => void,
  activateOcrCategory: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void,
  schedule: (callback: () => void) => void = (callback) => {
    requestAnimationFrame(callback);
  },
) {
  const stagePanel = form.querySelector<HTMLElement>(
    `[data-applyment-stage="${stage}"]`,
  );
  const invalid = stagePanel?.querySelector<HTMLElement>(":invalid");
  return invalid
    ? revealInvalidElement({
        form,
        invalid,
        activateStage,
        activateOcrCategory,
        schedule,
      })
    : true;
}

export function validateAllStages(
  form: HTMLFormElement,
  activateStage: (stage: ApplymentStageKey) => void,
  activateOcrCategory: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void,
  schedule: (callback: () => void) => void = (callback) => {
    requestAnimationFrame(callback);
  },
) {
  const invalid = form.querySelector<HTMLElement>(":invalid");
  if (!invalid) return true;
  return revealInvalidElement({
    form,
    invalid,
    activateStage,
    activateOcrCategory,
    schedule,
  });
}

function revealInvalidElement(input: {
  form: HTMLFormElement;
  invalid: HTMLElement;
  activateStage: (stage: ApplymentStageKey) => void;
  activateOcrCategory: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void;
  schedule: (callback: () => void) => void;
}) {
  return revealInvalidApplymentControl({
    control: {
      stage: getApplymentStage(input.invalid),
      ocrCategory: getOcrReviewCategory(input.invalid),
      focus: () => input.invalid.focus(),
    },
    activateStage: input.activateStage,
    activateOcrCategory: input.activateOcrCategory,
    reportValidity: () => {
      input.form.reportValidity();
    },
    schedule: input.schedule,
  });
}

function getApplymentStage(control: HTMLElement) {
  return control.closest<HTMLElement>("[data-applyment-stage]")
    ?.dataset.applymentStage;
}

function getOcrReviewCategory(control: HTMLElement) {
  return control.closest<HTMLElement>("[data-ocr-category]")
    ?.dataset.ocrCategory;
}

function isApplymentStage(
  value: string | undefined,
): value is ApplymentStageKey {
  return value === "materials" ||
    value === "recognition" ||
    value === "supplement" ||
    value === "submit";
}

function isOcrReviewCategory(
  value: string | undefined,
): value is WechatPayApplymentAttachmentCategory {
  return APPLYMENT_OCR_REVIEW_CATEGORIES.some((category) => category === value);
}
