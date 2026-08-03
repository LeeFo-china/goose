import { describe, expect, mock, test } from "bun:test";
import { createCipheriv } from "node:crypto";
import {
  diagnoseRejectedDouyinCallbackSignature,
} from "./callback-signature-diagnostics";

const AES_KEY = Buffer.alloc(32, 0x5a);
const ENCODING_AES_KEY = AES_KEY.toString("base64").slice(0, -1);
const COMPONENT_APP_ID = "tt-component-1";
const MESSAGE_SECRET = "diagnostic-ticket-secret";

function encryptedTicket(componentAppId = COMPONENT_APP_ID): string {
  const messageBytes = Buffer.from(JSON.stringify({
    Ticket: MESSAGE_SECRET,
    MsgType: "Ticket",
    Event: "PUSH",
  }), "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(messageBytes.length);
  const plaintext = Buffer.concat([
    Buffer.alloc(32, 0x31),
    length,
    messageBytes,
    Buffer.from(componentAppId, "utf8"),
  ]);
  const paddingLength = 32 - (plaintext.length % 32 || 32) || 32;
  const cipher = createCipheriv(
    "aes-256-cbc",
    AES_KEY,
    AES_KEY.subarray(0, 16),
  );
  cipher.setAutoPadding(false);
  return Buffer.concat([
    cipher.update(Buffer.concat([
      plaintext,
      Buffer.alloc(paddingLength, paddingLength),
    ])),
    cipher.final(),
  ]).toString("base64");
}

function diagnosticFixture(componentAppId = COMPONENT_APP_ID) {
  const encrypted = encryptedTicket(componentAppId);
  const log = { info: mock((_metadata: unknown, _message: string) => undefined) };
  return {
    encrypted,
    log,
    input: {
      enabled: true,
      wrapper: {
        Nonce: "nonce-1",
        TimeStamp: "1784793600",
        Encrypt: encrypted,
        MsgSignature: "0".repeat(40),
      },
      componentMessageAesKey: ENCODING_AES_KEY,
      componentAppId: COMPONENT_APP_ID,
      log,
    },
  };
}

describe("Douyin callback signature diagnostics", () => {
  test("reports decryption success without logging callback data", () => {
    const fixture = diagnosticFixture();

    diagnoseRejectedDouyinCallbackSignature(fixture.input);

    expect(fixture.log.info).toHaveBeenCalledWith(
      {
        eventName: "DOUYIN_CALLBACK_SIGNATURE_INVALID",
        diagnosticCode: "DOUYIN_CALLBACK_DECRYPTION_SUCCEEDED",
      },
      "classified rejected Douyin callback without accepting it",
    );
    const logged = JSON.stringify(fixture.log.info.mock.calls);
    expect(logged).not.toContain(MESSAGE_SECRET);
    expect(logged).not.toContain(fixture.encrypted);
  });

  test("reports a fixed error code when configured AppID does not decrypt-match", () => {
    const fixture = diagnosticFixture("tt-other-component");

    diagnoseRejectedDouyinCallbackSignature(fixture.input);

    expect(fixture.log.info).toHaveBeenCalledWith(
      {
        eventName: "DOUYIN_CALLBACK_SIGNATURE_INVALID",
        diagnosticCode: "DOUYIN_CALLBACK_COMPONENT_APP_ID_MISMATCH",
      },
      "classified rejected Douyin callback without accepting it",
    );
  });

  test("does nothing unless explicitly enabled", () => {
    const fixture = diagnosticFixture();

    diagnoseRejectedDouyinCallbackSignature({
      ...fixture.input,
      enabled: false,
    });

    expect(fixture.log.info).not.toHaveBeenCalled();
  });
});
