import {
  APPLYMENT_OCR_REVIEW_CATEGORIES,
} from "./finance-wechat-pay-applyment-recognized-fields";
import type { ApplymentStepKey } from "./finance-wechat-pay-applyment-steps";
import type {
  WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";

type InvalidControlTarget = {
  step?: string;
  ocrCategory?: string;
  focus: () => void;
};

export function revealInvalidApplymentControl(input: {
  control: InvalidControlTarget;
  activateStep: (step: ApplymentStepKey) => void;
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
  control: Pick<InvalidControlTarget, "step" | "ocrCategory">;
  activateStep: (step: ApplymentStepKey) => void;
  activateOcrCategory: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void;
}) {
  if (isApplymentStep(input.control.step)) {
    input.activateStep(input.control.step);
  }
  if (isOcrReviewCategory(input.control.ocrCategory)) {
    input.activateOcrCategory(input.control.ocrCategory);
  }
}

export function activateInvalidApplymentElement(
  control: HTMLElement,
  activateStep: (step: ApplymentStepKey) => void,
  activateOcrCategory: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void,
) {
  activateInvalidApplymentControl({
    control: {
      step: control.closest<HTMLElement>("[data-applyment-step]")
        ?.dataset.applymentStep,
      ocrCategory: control.closest<HTMLElement>("[data-ocr-category]")
        ?.dataset.ocrCategory,
    },
    activateStep,
    activateOcrCategory,
  });
}

export function validateApplymentForm(
  form: HTMLFormElement,
  activateStep: (step: ApplymentStepKey) => void,
  activateOcrCategory: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void,
) {
  const invalid = form.querySelector<HTMLElement>(":invalid");
  if (!invalid) return true;
  return revealInvalidApplymentControl({
    control: {
      step: getApplymentStep(invalid),
      ocrCategory: getOcrReviewCategory(invalid),
      focus: () => invalid.focus(),
    },
    activateStep,
    activateOcrCategory,
    reportValidity: () => {
      form.reportValidity();
    },
    schedule: (callback) => requestAnimationFrame(callback),
  });
}

function getApplymentStep(control: HTMLElement) {
  return control.closest<HTMLElement>("[data-applyment-step]")
    ?.dataset.applymentStep;
}

function getOcrReviewCategory(control: HTMLElement) {
  return control.closest<HTMLElement>("[data-ocr-category]")
    ?.dataset.ocrCategory;
}

function isApplymentStep(value: string | undefined): value is ApplymentStepKey {
  return value === "subject" ||
    value === "identity" ||
    value === "contact" ||
    value === "settlement" ||
    value === "attachments" ||
    value === "review";
}

function isOcrReviewCategory(
  value: string | undefined,
): value is WechatPayApplymentAttachmentCategory {
  return APPLYMENT_OCR_REVIEW_CATEGORIES.some((category) => category === value);
}
