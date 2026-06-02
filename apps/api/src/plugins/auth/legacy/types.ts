import type { verifyToken } from "@/utils/jwt";

export type VerifiedJwtPayload = NonNullable<ReturnType<typeof verifyToken>>;

export type TokenErrorReason = "missing" | "expired" | "invalid";

export type AuthRejectReason =
  | TokenErrorReason
  | "unsupported_visitor_route"
  | "unsupported_token_type";
