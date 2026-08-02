import { describe, expect, test } from "bun:test";

import type { PlatformVirtualGoodsLifecycleSnapshot } from
  "./platform-virtual-payment-settings-types";
import {
  getGoodsActionAvailability,
  getGoodsPhasePresentation,
  nextGoodsPollDelay,
} from "./platform-virtual-payment-goods-flow-data";

const snapshot: PlatformVirtualGoodsLifecycleSnapshot = {
  environment: "production",
  mapping_version: 3,
  upload: {
    state: "succeeded",
    task_status: 3,
    item_status: 2,
    request_id: "upload-request-id",
  },
  publish: {
    state: "not_started",
    task_status: 0,
    item_status: null,
    request_id: "publish-request-id",
  },
  next_action: "publish",
  poll_after_ms: null,
};

describe("platform virtual-payment goods flow data", () => {
  test("maps phase states to explicit operational labels", () => {
    expect(getGoodsPhasePresentation("upload", "processing")).toEqual({
      label: "上传中",
      variant: "warning",
    });
    expect(getGoodsPhasePresentation("publish", "mismatch")).toEqual({
      label: "需重新发布",
      variant: "danger",
    });
    expect(getGoodsPhasePresentation("publish", "succeeded")).toEqual({
      label: "已发布",
      variant: "success",
    });
  });

  test("enables only the next valid action", () => {
    expect(getGoodsActionAvailability(snapshot)).toEqual({
      upload: false,
      publish: true,
      validate: false,
    });
    expect(getGoodsActionAvailability({
      ...snapshot,
      next_action: "wait_publish",
      publish: { ...snapshot.publish, state: "processing" },
      poll_after_ms: 2_000,
    })).toEqual({ upload: false, publish: false, validate: false });
  });

  test("polls processing tasks at a bounded server-approved interval", () => {
    expect(nextGoodsPollDelay({
      processing: true,
      attempts: 0,
      serverDelayMs: 2_000,
    })).toBe(2_000);
    expect(nextGoodsPollDelay({
      processing: true,
      attempts: 15,
      serverDelayMs: 2_000,
    })).toBeNull();
    expect(nextGoodsPollDelay({
      processing: false,
      attempts: 0,
      serverDelayMs: null,
    })).toBeNull();
  });
});
