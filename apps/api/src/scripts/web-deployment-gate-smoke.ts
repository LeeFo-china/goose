import { smsVerificationCodeRepository } from "@/repositories/sms-verification-codes";

const reservedIds: string[] = [];
const seed = Date.now().toString().slice(-7);
const now = new Date();
const baseInput = {
  scene: "partner_application" as const,
  code: "000000",
  expiredAt: new Date(now.getTime() + 60_000).toISOString(),
  since: new Date(now.getTime() - 60_000).toISOString(),
  requestIpLimit: 5,
};

async function reserve(phone: string, requestIp: string, requestDevice: string) {
  const result = await smsVerificationCodeRepository.reservePending({
    ...baseInput,
    phone,
    requestIp,
    requestDevice,
  });
  if (result.reserved) reservedIds.push(result.id);
  return result.reserved;
}

function phone(index: number): string {
  return `19${seed}${String(index).padStart(2, "0")}`.slice(0, 11);
}

async function main(): Promise<void> {
try {
  const ipResults = await Promise.all(
    Array.from({ length: 6 }, (_, index) => reserve(phone(index), "192.0.2.210", `gate-ip-${seed}-${index}`)),
  );
  const phoneResults = await Promise.all([
    reserve(phone(20), "192.0.2.211", `gate-phone-a-${seed}`),
    reserve(phone(20), "192.0.2.212", `gate-phone-b-${seed}`),
  ]);
  const deviceResults = await Promise.all([
    reserve(phone(21), "192.0.2.213", `gate-device-${seed}`),
    reserve(phone(22), "192.0.2.214", `gate-device-${seed}`),
  ]);
  const receipt = {
    ip_concurrency_passed: ipResults.filter(Boolean).length <= 5,
    phone_concurrency_passed: phoneResults.filter(Boolean).length <= 1,
    device_concurrency_passed: deviceResults.filter(Boolean).length <= 1,
  };
  if (!Object.values(receipt).every(Boolean)) process.exitCode = 1;
  console.log(JSON.stringify(receipt));
} finally {
  await Promise.all(reservedIds.map((id) => smsVerificationCodeRepository.deletePendingById(id)));
}
}

void main();
