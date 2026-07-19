import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";

export type JwtPayload = {
  sub?: string;
  token_type?: "auth" | "visitor_session" | "h5_marketing" | "platform_partner"
    | "douyin_miniapp";
  openid?: string;
  unionid?: string | null;
  visitor_id?: string;
  login_channel?: "wechat" | "admin_web" | "douyin";
  roles?: string[];
  tenant_id?: string | null;
  tenant_slug?: string | null;
  employee_id?: string | null;
  customer_id?: string | null;
  partner_id?: string | null;
  verified_phone?: string | null;
  share_link_id?: string | null;
  douyin_installation_id?: string;
  douyin_app_id?: string;
  subject_hash?: string;
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

export type DouyinMiniappTokenPayload = JwtPayload & {
  token_type: "douyin_miniapp";
  login_channel: "douyin";
  tenant_id: string;
  douyin_installation_id: string;
  douyin_app_id: string;
  subject_hash: string;
};

export type DouyinMiniappTokenInput = Pick<
  DouyinMiniappTokenPayload,
  "tenant_id" | "douyin_installation_id" | "douyin_app_id" | "subject_hash"
>;

type JwtHeader = {
  alg: "HS256";
  typ: "JWT";
};

const encoder = new TextEncoder();
const DOUYIN_MINIAPP_DEFAULT_EXPIRES_IN_SECONDS = 2 * 60 * 60;
const DOUYIN_MINIAPP_MAX_EXPIRES_IN_SECONDS = 24 * 60 * 60;
const DOUYIN_MINIAPP_CLAIMS = new Set([
  "sub",
  "token_type",
  "login_channel",
  "roles",
  "tenant_id",
  "douyin_installation_id",
  "douyin_app_id",
  "subject_hash",
  "iat",
  "exp",
]);

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

export function signVisitorSessionToken(payload: Omit<
  JwtPayload,
  "iat" | "exp" | "token_type" | "roles" | "login_channel"
> & {
  openid: string;
  visitor_id: string;
}) {
  return signJwtPayload(
    {
      ...payload,
      token_type: "visitor_session",
      login_channel: "wechat",
      roles: ["visitor"],
    },
    process.env.VISITOR_SESSION_JWT_EXPIRES_IN || "2h",
  );
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

export function signDouyinMiniappToken(payload: DouyinMiniappTokenInput) {
  return signJwtPayload(
    {
      ...payload,
      sub: payload.subject_hash,
      token_type: "douyin_miniapp",
      login_channel: "douyin",
      roles: ["douyin_miniapp"],
    },
    `${getDouyinMiniappTokenExpiresInSeconds()}s`,
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

    if (!payload.exp) {
      return { payload: null, reason: "invalid" };
    }

    if (payload.token_type === "visitor_session") {
      if (!payload.openid || !payload.visitor_id) {
        return { payload: null, reason: "invalid" };
      }
    } else if (payload.token_type === "douyin_miniapp") {
      if (!isValidDouyinMiniappPayload(payload, now)) {
        return { payload: null, reason: "invalid" };
      }
    } else if (!payload.sub) {
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

export function getDouyinMiniappTokenExpiresInSeconds() {
  const configured = process.env.DOUYIN_MINIAPP_SESSION_EXPIRES_IN;
  const parsed = configured
    ? parseJwtExpiresIn(configured)
    : DOUYIN_MINIAPP_DEFAULT_EXPIRES_IN_SECONDS;

  return Number.isSafeInteger(parsed)
    && parsed > 0
    && parsed <= DOUYIN_MINIAPP_MAX_EXPIRES_IN_SECONDS
    ? parsed
    : DOUYIN_MINIAPP_DEFAULT_EXPIRES_IN_SECONDS;
}

function isValidDouyinMiniappPayload(
  payload: JwtPayload,
  now: number,
): payload is DouyinMiniappTokenPayload {
  return Object.keys(payload).every((claim) => DOUYIN_MINIAPP_CLAIMS.has(claim))
    && payload.login_channel === "douyin"
    && Array.isArray(payload.roles)
    && payload.roles.length === 1
    && payload.roles[0] === "douyin_miniapp"
    && typeof payload.tenant_id === "string"
    && UUID_PATTERN.test(payload.tenant_id)
    && typeof payload.douyin_installation_id === "string"
    && UUID_PATTERN.test(payload.douyin_installation_id)
    && typeof payload.douyin_app_id === "string"
    && payload.douyin_app_id.trim() === payload.douyin_app_id
    && payload.douyin_app_id.length > 0
    && payload.douyin_app_id.length <= 128
    && typeof payload.subject_hash === "string"
    && /^[a-f0-9]{64}$/.test(payload.subject_hash)
    && payload.sub === payload.subject_hash
    && Number.isSafeInteger(payload.iat)
    && Number.isSafeInteger(payload.exp)
    && payload.iat! >= 0
    && payload.iat! <= now + 60
    && payload.exp! > payload.iat!
    && payload.exp! - payload.iat! <= DOUYIN_MINIAPP_MAX_EXPIRES_IN_SECONDS;
}

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
