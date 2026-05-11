import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";

export type JwtPayload = {
  sub: string;
  token_type?: "auth" | "h5_marketing";
  openid?: string;
  login_channel?: "wechat" | "admin_web";
  roles?: string[];
  tenant_id?: string | null;
  tenant_slug?: string | null;
  employee_id?: string | null;
  customer_id?: string | null;
  verified_phone?: string | null;
  iat?: number;
  exp?: number;
};

export type H5MarketingTokenPayload = JwtPayload & {
  token_type: "h5_marketing";
  tenant_id?: string | null;
  slug: string;
  customer_id?: string | null;
  scene?: string | null;
};

type JwtHeader = {
  alg: "HS256";
  typ: "JWT";
};

const encoder = new TextEncoder();

function toBase64Url(value: string | Uint8Array) {
  const input = typeof value === "string"
    ? Buffer.from(value)
    : Buffer.from(value);
  return input.toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function parseJwtExpiresIn(expiresIn: string) {
  const normalized = expiresIn.trim();

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const match = normalized.match(/^(\d+)([smhd])$/i);
  if (!match) {
    return 7 * 24 * 60 * 60;
  }

  const amountPart = match[1];
  const unitPart = match[2];
  if (!amountPart || !unitPart) {
    return 7 * 24 * 60 * 60;
  }

  const multipliers = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  } as const;

  const amount = Number(amountPart);
  const unit = unitPart.toLowerCase() as keyof typeof multipliers;

  return amount * multipliers[unit];
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new AppError(
      500,
      "缺少 JWT_SECRET 环境变量",
      ErrorCodes.INTERNAL_ERROR,
    );
  }

  return secret;
}

function signRaw(content: string, secret: string) {
  return createHmac("sha256", secret).update(content).digest("base64url");
}

function signJwtPayload(
  payload: Omit<JwtPayload, "iat" | "exp">,
  expiresInValue: string,
) {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = parseJwtExpiresIn(expiresInValue);

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

export function signToken(payload: Omit<JwtPayload, "iat" | "exp">) {
  return signJwtPayload(payload, process.env.JWT_EXPIRES_IN || "7d");
}

export function signH5MarketingToken(
  payload: Omit<H5MarketingTokenPayload, "iat" | "exp" | "token_type">,
) {
  return signJwtPayload(
    {
      ...payload,
      token_type: "h5_marketing",
    },
    process.env.H5_MARKETING_TOKEN_EXPIRES_IN || "30m",
  );
}

export function verifyTokenDetailed(token: string): {
  payload: JwtPayload | null;
  reason: "valid" | "expired" | "invalid";
} {
  const secret = getJwtSecret();
  const parts = token.split(".");

  if (parts.length !== 3) {
    return { payload: null, reason: "invalid" };
  }

  const [encodedHeader, encodedPayload, signature] = parts as [
    string,
    string,
    string,
  ];
  const expectedSignature = signRaw(
    `${encodedHeader}.${encodedPayload}`,
    secret,
  );
  if (signature.length !== expectedSignature.length) {
    return { payload: null, reason: "invalid" };
  }

  const isValidSignature = timingSafeEqual(
    encoder.encode(signature),
    encoder.encode(expectedSignature),
  );

  if (!isValidSignature) {
    return { payload: null, reason: "invalid" };
  }

  try {
    const header = JSON.parse(fromBase64Url(encodedHeader)) as JwtHeader;
    if (header.alg !== "HS256" || header.typ !== "JWT") {
      return { payload: null, reason: "invalid" };
    }

    const payload = JSON.parse(fromBase64Url(encodedPayload)) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);

    if (!payload.sub || !payload.exp) {
      return { payload: null, reason: "invalid" };
    }

    if (payload.exp <= now) {
      return { payload, reason: "expired" };
    }

    return { payload, reason: "valid" };
  } catch {
    return { payload: null, reason: "invalid" };
  }
}

export function verifyToken(token: string) {
  const result = verifyTokenDetailed(token);
  return result.reason === "valid" ? result.payload : null;
}

export function verifyH5MarketingToken(token: string): {
  payload: H5MarketingTokenPayload | null;
  reason: "valid" | "expired" | "invalid";
} {
  const result = verifyTokenDetailed(token);
  const payload = result.payload;

  if (result.reason === "invalid" || !payload) {
    return { payload: null, reason: "invalid" };
  }

  if (
    payload.token_type !== "h5_marketing" ||
    typeof (payload as Partial<H5MarketingTokenPayload>).slug !== "string"
  ) {
    return { payload: null, reason: "invalid" };
  }

  return {
    payload: payload as H5MarketingTokenPayload,
    reason: result.reason,
  };
}

export function getJwtExpiresAt(now = Date.now()) {
  const expiresIn = parseJwtExpiresIn(process.env.JWT_EXPIRES_IN || "7d");
  return new Date(now + expiresIn * 1000).toISOString();
}

export function getH5MarketingTokenExpiresAt(now = Date.now()) {
  const expiresIn = parseJwtExpiresIn(
    process.env.H5_MARKETING_TOKEN_EXPIRES_IN || "30m",
  );
  return new Date(now + expiresIn * 1000).toISOString();
}
