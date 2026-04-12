import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";

export type JwtPayload = {
  sub: string;
  openid: string;
  roles?: string[];
  iat?: number;
  exp?: number;
};

type JwtHeader = {
  alg: "HS256";
  typ: "JWT";
};

const encoder = new TextEncoder();

function toBase64Url(value: string | Uint8Array) {
  const input = typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
  return input.toString("base64url" as BufferEncoding);
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url" as BufferEncoding).toString("utf8");
}

function parseExpiresIn(expiresIn: string) {
  const normalized = expiresIn.trim();
  const defaultExpiresIn = 7 * 24 * 60 * 60;

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const match = normalized.match(/^(\d+)([smhd])$/i);
  if (!match) {
    return defaultExpiresIn;
  }

  const [, rawAmount, rawUnit] = match;

  if (!rawAmount || !rawUnit) {
    return defaultExpiresIn;
  }

  const amount = Number(rawAmount);
  const unit = rawUnit.toLowerCase();

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };

  const multiplier = multipliers[unit];

  if (!multiplier) {
    return defaultExpiresIn;
  }

  return amount * multiplier;
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new AppError(500, "缺少 JWT_SECRET 环境变量", ErrorCodes.INTERNAL_ERROR);
  }

  return secret;
}

function signRaw(content: string, secret: string) {
  return createHmac("sha256", secret).update(content).digest("base64url" as import("crypto").BinaryToTextEncoding);
}

export function signToken(payload: Omit<JwtPayload, "iat" | "exp">) {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = parseExpiresIn(process.env.JWT_EXPIRES_IN || "7d");

  const header: JwtHeader = {
    alg: "HS256",
    typ: "JWT",
  };

  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(fullPayload));
  const signature = signRaw(`${encodedHeader}.${encodedPayload}`, secret);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyToken(token: string) {
  const secret = getJwtSecret();
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signRaw(`${encodedHeader}.${encodedPayload}`, secret);
  if (signature.length !== expectedSignature.length) {
    return null;
  }

  const isValidSignature = timingSafeEqual(
    encoder.encode(signature),
    encoder.encode(expectedSignature),
  );

  if (!isValidSignature) {
    return null;
  }

  const header = JSON.parse(fromBase64Url(encodedHeader)) as JwtHeader;
  if (header.alg !== "HS256" || header.typ !== "JWT") {
    return null;
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload)) as JwtPayload;
  const now = Math.floor(Date.now() / 1000);

  if (!payload.sub || !payload.openid || !payload.exp || payload.exp <= now) {
    return null;
  }

  return payload;
}
