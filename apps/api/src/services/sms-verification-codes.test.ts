import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { SmsScene } from "@gooes/domain";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const serviceModule = import("@/services/sms-verification-codes");

interface SmsRecord {
  phone: string;
  requestDevice: string | null;
  requestIp: string | null;
  scene: SmsScene;
}

async function createHarness() {
  const { SmsVerificationCodeService } = await serviceModule;
  const records: SmsRecord[] = [];
  const repository = {
    reservePending(input: {
      phone: string;
      requestDevice?: string | null;
      requestIp: string | null;
      requestIpLimit: number;
      scene: SmsScene;
    }) {
      const limitedDimension: "phone" | "request_device" | "request_ip" | null =
        records.some(
          (record) => record.phone === input.phone && record.scene === input.scene,
        )
          ? "phone"
          : input.requestDevice &&
              records.some(
                (record) =>
                  record.requestDevice === input.requestDevice &&
                  record.scene === input.scene,
              )
            ? "request_device"
            : input.requestIp &&
                records.filter(
                  (record) =>
                    record.requestIp === input.requestIp &&
                    record.scene === input.scene,
                ).length >= input.requestIpLimit
              ? "request_ip"
              : null;
      if (limitedDimension) {
        return Promise.resolve({
          reserved: false as const,
          id: null,
          limitedDimension,
        });
      }

      records.push({
        phone: input.phone,
        requestDevice: input.requestDevice ?? null,
        requestIp: input.requestIp,
        scene: input.scene,
      });
      return Promise.resolve({
        reserved: true as const,
        id: `00000000-0000-4000-8000-${String(records.length).padStart(12, "0")}`,
        limitedDimension: null,
      });
    },
    deletePendingById() {
      return Promise.resolve();
    },
  };
  const send = mock(async () => undefined);
  const service = new SmsVerificationCodeService({ repository, send });

  return { send, service };
}

function sendInput(
  index: number,
  overrides: Partial<{
    phone: string;
    requestDevice: string;
    requestIpLimit: number;
    scene: SmsScene;
  }> = {},
) {
  return {
    phone: overrides.phone ?? `1380000000${index}`,
    requestIp: "127.0.0.1",
    requestDevice: overrides.requestDevice ?? `device-${index}`,
    requestIpLimit: overrides.requestIpLimit,
    scene: overrides.scene ?? ("partner_application" as const),
  };
}

function fulfilledCount(results: PromiseSettledResult<unknown>[]): number {
  return results.filter((result) => result.status === "fulfilled").length;
}

describe("SmsVerificationCodeService atomic rate limits", () => {
  test("allows at most five concurrent partner applications per shared IP", async () => {
    const { send, service } = await createHarness();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        service.sendCode(sendInput(index, { requestIpLimit: 5 })),
      ),
    );

    expect(fulfilledCount(results)).toBe(5);
    expect(send).toHaveBeenCalledTimes(5);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { statusCode: 429, code: "SMS_CODE_RATE_LIMITED" },
    });
  });

  test("allows at most one concurrent request for the same phone or device", async () => {
    const phoneHarness = await createHarness();
    const phoneResults = await Promise.allSettled([
      phoneHarness.service.sendCode(sendInput(0, { requestIpLimit: 5 })),
      phoneHarness.service.sendCode(
        sendInput(1, { phone: "13800000000", requestIpLimit: 5 }),
      ),
    ]);
    expect(fulfilledCount(phoneResults)).toBe(1);

    const deviceHarness = await createHarness();
    const deviceResults = await Promise.allSettled([
      deviceHarness.service.sendCode(sendInput(0, { requestIpLimit: 5 })),
      deviceHarness.service.sendCode(
        sendInput(1, { requestDevice: "device-0", requestIpLimit: 5 }),
      ),
    ]);
    expect(fulfilledCount(deviceResults)).toBe(1);
  });

  test("keeps the default IP limit at one for other scenes", async () => {
    const { service } = await createHarness();
    const results = await Promise.allSettled([
      service.sendCode(sendInput(0, { scene: "bind_customer" })),
      service.sendCode(sendInput(1, { scene: "bind_customer" })),
    ]);

    expect(fulfilledCount(results)).toBe(1);
  });

  test("cleans up only the current reservation when SMS sending fails", async () => {
    const { SmsVerificationCodeService } = await serviceModule;
    const reservationId = "00000000-0000-4000-8000-000000000123";
    const smsFailure = new Error("SMS provider rejected");
    const deletePendingById = mock(async () => undefined);
    const service = new SmsVerificationCodeService({
      repository: {
        reservePending: async () => ({
          reserved: true,
          id: reservationId,
          limitedDimension: null,
        }),
        deletePendingById,
      },
      send: async () => {
        throw smsFailure;
      },
    });

    await expect(service.sendCode(sendInput(0))).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "发送验证码失败",
      details: smsFailure,
    });
    expect(deletePendingById).toHaveBeenCalledWith(reservationId);
  });

  test("propagates cleanup database failures instead of hiding pending residue", async () => {
    const { SmsVerificationCodeService } = await serviceModule;
    const cleanupFailure = Errors.dbError("清理验证码失败", {
      message: "database unavailable",
    });
    const service = new SmsVerificationCodeService({
      repository: {
        reservePending: async () => ({
          reserved: true,
          id: "00000000-0000-4000-8000-000000000124",
          limitedDimension: null,
        }),
        deletePendingById: async () => {
          throw cleanupFailure;
        },
      },
      send: async () => {
        throw new Error("SMS provider rejected");
      },
    });

    await expect(service.sendCode(sendInput(0))).rejects.toBe(cleanupFailure);
  });
});
