import { AppError } from "@/errors/app-error";
import type { DouyinCallbackWrapper } from "@/schema/douyin-third-party-events";
import { decryptDouyinCallback } from "./callback-crypto";

const MAX_DIAGNOSTIC_CIPHERTEXT_LENGTH = 16 * 1024;

export const DOUYIN_SIGNATURE_DIAGNOSTIC_MODE = "decrypt-only";

export type DouyinCallbackDiagnosticLogger = {
  info(
    metadata: {
      readonly eventName: string;
      readonly diagnosticCode?: string;
    },
    message: string,
  ): void;
};

type DiagnoseRejectedSignatureInput = {
  readonly enabled: boolean;
  readonly wrapper: DouyinCallbackWrapper;
  readonly componentMessageAesKey: string;
  readonly componentAppId: string;
  readonly log: DouyinCallbackDiagnosticLogger;
};

export function diagnoseRejectedDouyinCallbackSignature(
  input: DiagnoseRejectedSignatureInput,
): void {
  if (
    !input.enabled ||
    input.wrapper.Encrypt.length > MAX_DIAGNOSTIC_CIPHERTEXT_LENGTH
  ) return;

  let diagnosticCode = "DOUYIN_CALLBACK_DECRYPTION_SUCCEEDED";
  try {
    decryptDouyinCallback({
      encrypted: input.wrapper.Encrypt,
      encodingAesKey: input.componentMessageAesKey,
      expectedComponentAppId: input.componentAppId,
    });
  } catch (error) {
    diagnosticCode = error instanceof AppError
      ? error.code
      : "DOUYIN_CALLBACK_DIAGNOSTIC_FAILED";
  }

  try {
    input.log.info(
      {
        eventName: "DOUYIN_CALLBACK_SIGNATURE_INVALID",
        diagnosticCode,
      },
      "classified rejected Douyin callback without accepting it",
    );
  } catch {
    // Diagnostics must never change the callback rejection result.
  }
}
