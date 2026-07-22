import { describe, expect, test } from "bun:test";

import {
  createLatestPublicKeyFileReader,
  normalizeTencentOcrPublicKeyInput,
} from "./platform-ocr-public-key-input";

const PEM = [
  "-----BEGIN RSA PUBLIC KEY-----",
  "AQID",
  "-----END RSA PUBLIC KEY-----",
].join("\n");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("OCR encryption public key editor", () => {
  test("exports a public key input normalizer", async () => {
    const module = await import("./platform-ocr-public-key-input");

    expect(module.normalizeTencentOcrPublicKeyInput).toBeFunction();
    expect(module.createLatestPublicKeyFileReader).toBeFunction();
  });

  test("normalizes a PKCS#1 PEM value", () => {
    expect(
      normalizeTencentOcrPublicKeyInput(`  ${PEM.replaceAll("\n", "\r\n")}  `),
    ).toEqual({ ok: true, pem: PEM, source: "pem" });
  });

  test("decodes and normalizes an outer Base64 wrapper", () => {
    expect(normalizeTencentOcrPublicKeyInput(btoa(PEM))).toEqual({
      ok: true,
      pem: PEM,
      source: "base64",
    });
  });

  test("rejects empty, malformed, and non-PKCS#1 input", () => {
    expect(normalizeTencentOcrPublicKeyInput(" ")).toEqual({
      ok: false,
      error: "请粘贴或上传 OCR 加密公钥",
    });
    expect(normalizeTencentOcrPublicKeyInput("not-a-key")).toEqual({
      ok: false,
      error:
        "公钥格式错误，请上传原始 PKCS#1 PEM 文件或粘贴该 PEM 的外层 Base64 编码",
    });
    expect(
      normalizeTencentOcrPublicKeyInput(
        "-----BEGIN PUBLIC KEY-----\nAQID\n-----END PUBLIC KEY-----",
      ).ok,
    ).toBeFalse();
  });

  test("ignores an earlier file read that finishes after the latest selection", async () => {
    const reader = createLatestPublicKeyFileReader();
    const firstRead = deferred<string>();
    const secondRead = deferred<string>();
    const firstResult = reader.read({ text: () => firstRead.promise });
    const secondResult = reader.read({ text: () => secondRead.promise });

    secondRead.resolve("second");
    expect(await secondResult).toEqual({ status: "ready", content: "second" });
    firstRead.resolve("first");
    expect(await firstResult).toEqual({ status: "stale" });
  });

  test("does not restore file material after the reader is invalidated", async () => {
    const reader = createLatestPublicKeyFileReader();
    const pendingRead = deferred<string>();
    const result = reader.read({ text: () => pendingRead.promise });

    reader.invalidate();
    pendingRead.resolve(PEM);

    expect(await result).toEqual({ status: "stale" });
  });

  test("returns a safe error when the browser cannot read the file", async () => {
    const reader = createLatestPublicKeyFileReader();

    expect(
      await reader.read({
        text: async () => {
          throw new Error("disk detail");
        },
      }),
    ).toEqual({ status: "error", error: "无法读取公钥文件，请重新选择" });
  });
});
