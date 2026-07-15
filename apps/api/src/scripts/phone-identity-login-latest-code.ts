import { SupabaseDB } from "@/utils/supabase";

type SmsVerificationCodeLookupRow = {
  phone: string;
  code: string;
  status: string;
  expired_at: string;
  created_at: string;
};

const PHONE_PATTERN = /^1[3-9]\d{9}$/;

function readPhoneArg() {
  const cliPhone = process.argv
    .find((arg) => arg.startsWith("--phone="))
    ?.slice("--phone=".length)
    .trim();
  return cliPhone || process.env.PHONE_IDENTITY_LOGIN_PHONE?.trim() || "";
}

function assertDevLookupEnabled() {
  if (process.env.GOOES_ALLOW_DEV_CODE_LOOKUP === "true") return;

  throw new Error(
    "Set GOOES_ALLOW_DEV_CODE_LOOKUP=true before reading dev SMS verification codes.",
  );
}

async function main() {
  assertDevLookupEnabled();

  const phone = readPhoneArg();
  if (!PHONE_PATTERN.test(phone)) {
    throw new Error(
      "Usage: GOOES_ALLOW_DEV_CODE_LOOKUP=true bun --env-file=.env src/scripts/phone-identity-login-latest-code.ts --phone=19900004002",
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("sms_verification_codes")
    .select("phone, code, status, expired_at, created_at")
    .eq("phone", phone)
    .eq("scene", "login_identity")
    .eq("status", "pending")
    .gt("expired_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = (data || null) as SmsVerificationCodeLookupRow | null;
  if (!row) {
    console.log(JSON.stringify({
      phone,
      scene: "login_identity",
      code: null,
      status: "not_found",
      message: "No pending unexpired login_identity code found. Call send-code first.",
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  console.log(JSON.stringify({
    phone: row.phone,
    scene: "login_identity",
    code: row.code,
    status: row.status,
    expired_at: row.expired_at,
    created_at: row.created_at,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
