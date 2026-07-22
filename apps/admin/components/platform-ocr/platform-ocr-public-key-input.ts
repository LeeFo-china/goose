const PUBLIC_KEY_HEADER = "-----BEGIN RSA PUBLIC KEY-----";
const PUBLIC_KEY_FOOTER = "-----END RSA PUBLIC KEY-----";

export const MAX_PUBLIC_KEY_FILE_SIZE = 64 * 1024;

type PublicKeyNormalizationResult =
  | { ok: true; pem: string; source: "pem" | "base64" }
  | { ok: false; error: string };

export function createLatestPublicKeyFileReader() {
  let currentRead = 0;

  return {
    invalidate() {
      currentRead += 1;
    },
    async read(file: Pick<File, "text">) {
      const readId = ++currentRead;
      try {
        const content = await file.text();
        if (readId !== currentRead) return { status: "stale" as const };
        return { status: "ready" as const, content };
      } catch {
        if (readId !== currentRead) return { status: "stale" as const };
        return {
          status: "error" as const,
          error: "无法读取公钥文件，请重新选择",
        };
      }
    },
  };
}

function normalizePem(value: string) {
  const normalized = value.trim().replaceAll("\r\n", "\n");
  const match = normalized.match(
    /^-----BEGIN RSA PUBLIC KEY-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END RSA PUBLIC KEY-----$/,
  );
  if (!match?.[1]) return null;

  const body = match[1].replaceAll(/\s/g, "");
  try {
    atob(body);
  } catch {
    return null;
  }

  const lines = body.match(/.{1,64}/g);
  if (!lines?.length) return null;
  return [PUBLIC_KEY_HEADER, ...lines, PUBLIC_KEY_FOOTER].join("\n");
}

export function normalizeTencentOcrPublicKeyInput(
  value: string,
): PublicKeyNormalizationResult {
  const normalized = value.trim();
  if (!normalized) {
    return { ok: false, error: "请粘贴或上传 OCR 加密公钥" };
  }
  if (normalized.length > MAX_PUBLIC_KEY_FILE_SIZE) {
    return { ok: false, error: "公钥文件不能超过 64KB" };
  }

  const pem = normalizePem(normalized);
  if (pem) return { ok: true, pem, source: "pem" };

  try {
    const decoded = atob(normalized.replaceAll(/\s/g, ""));
    const decodedPem = normalizePem(decoded);
    if (decodedPem) {
      return { ok: true, pem: decodedPem, source: "base64" };
    }
  } catch {
    // Fall through to the safe validation message below.
  }

  return {
    ok: false,
    error:
      "公钥格式错误，请上传原始 PKCS#1 PEM 文件或粘贴该 PEM 的外层 Base64 编码",
  };
}
