import type {
  OcrCapability,
  OcrFieldSuggestion,
  OcrRecognitionView,
  OcrWarning,
} from "@gooes/domain";

export type OcrCapabilitiesResult = OcrCapability[];

export type OcrRecognitionResult = {
  recognition: OcrRecognitionView & {
    quality?: Record<string, unknown>;
  };
  idempotent: boolean;
  cached: boolean;
};

export type OcrReviewField = OcrFieldSuggestion;
export type OcrReviewWarning = OcrWarning;
