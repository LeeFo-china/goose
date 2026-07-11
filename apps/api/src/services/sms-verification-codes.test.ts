import { describe, expect, mock, test } from "bun:test";

import { SmsVerificationCodeService } from "@/services/sms-verification-codes";
import type { SmsScene } from "@gooes/domain";

interface SmsRecord {
  phone: string;
  requestDevice: string | null;
  requestIp: string | null;
  scene: SmsScene;
}

function createHarness() {
  const records: SmsRecord[] = [];
  const repository = {
    findRecentByPhoneScene(input: { phone: string; scene: SmsScene }) {
      return Promise.resolve(
        records.find(
          (record) => record.phone === input.phone && record.scene === input.scene,
        ) ?? null,
      );
    },
    countRecentByRequestIpScene(input: {
      requestIp: string;
      scene: SmsScene;
    }) {
      return Promise.resolve(
        records.filter(
          (record) =>
            record.requestIp === input.requestIp && record.scene === input.scene,
        ).length,
      );
    },
    findRecentByRequestDeviceScene(input: {
      requestDevice: string;
      scene: SmsScene;
    }) {
      return Promise.resolve(
        records.find(
          (record) =>
            record.requestDevice === input.requestDevice &&
            record.scene === input.scene,
        ) ?? null,
      );
    },
    createPending(input: {
      phone: string;
      requestDevice?: string | null;
      requestIp: string | null;
      scene: SmsScene;
    }) {
      records.push({
        phone: input.phone,
        requestDevice: input.requestDevice ?? null,
        requestIp: input.requestIp,
        scene: input.scene,
      });
      return Promise.resolve();
    },
    deletePendingByPhoneSceneCode() {
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

describe("SmsVerificationCodeService rate limits", () => {
  test("allows five partner applications per shared IP and rejects the sixth", async () => {
    const { send, service } = createHarness();

    for (let index = 0; index < 5; index += 1) {
      await service.sendCode(sendInput(index, { requestIpLimit: 5 }));
    }

    await expect(
      service.sendCode(sendInput(5, { requestIpLimit: 5 })),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: "SMS_CODE_RATE_LIMITED",
    });
    expect(send).toHaveBeenCalledTimes(5);
  });

  test("still rejects a repeated phone or device within the window", async () => {
    const phoneHarness = createHarness();
    await phoneHarness.service.sendCode(sendInput(0, { requestIpLimit: 5 }));
    await expect(
      phoneHarness.service.sendCode(
        sendInput(1, { phone: "13800000000", requestIpLimit: 5 }),
      ),
    ).rejects.toMatchObject({ statusCode: 429 });

    const deviceHarness = createHarness();
    await deviceHarness.service.sendCode(sendInput(0, { requestIpLimit: 5 }));
    await expect(
      deviceHarness.service.sendCode(
        sendInput(1, { requestDevice: "device-0", requestIpLimit: 5 }),
      ),
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  test("keeps the default IP limit at one for other scenes", async () => {
    const { service } = createHarness();
    await service.sendCode(sendInput(0, { scene: "bind_customer" }));

    await expect(
      service.sendCode(sendInput(1, { scene: "bind_customer" })),
    ).rejects.toMatchObject({ statusCode: 429 });
  });
});
