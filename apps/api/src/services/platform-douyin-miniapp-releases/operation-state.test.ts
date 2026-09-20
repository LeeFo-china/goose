import { expect, test } from "bun:test";
import type { DouyinMiniappReleaseRecord } from
  "@/repositories/douyin-miniapp-releases";
import { recoveryPatch } from "./operation-state";

const release: DouyinMiniappReleaseRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  installation_id: "22222222-2222-4222-8222-222222222222",
  deployable_template_id: null,
  template_id: "78690",
  template_version: "0.1.39",
  description: "装修行业生产模板",
  provider_summary: "[#78690] 装修行业生产模板",
  channel: "default",
  ext_json: {
    extEnable: true,
    extAppid: "tt-authorizer",
    ext: { deployment_key: "deployment-key" },
  },
  status: "created",
  douyin_log_id: null,
  test_qr_url: null,
  latest_test_qr_url: null,
  audit_qr_url: null,
  audit_host_names: [],
  audit_note: null,
  audit_result: null,
  submitted_at: null,
  audited_at: null,
  released_at: null,
  platform_operator_id: "33333333-3333-4333-8333-333333333333",
  created_at: "2026-09-17T10:00:00.000Z",
  updated_at: "2026-09-17T10:00:00.000Z",
};

test("does not recover a marked release from another same-version package", () => {
  expect(recoveryPatch(release, {
    latest: { version: "0.1.39", summary: "[#78689] 旧模板" },
    logId: "versions-log",
  }, "2026-09-17T10:01:00.000Z")).toBeNull();
});

test("recovers a marked release from the exact provider summary", () => {
  expect(recoveryPatch(release, {
    latest: {
      version: "0.1.39",
      summary: "[#78690] 装修行业生产模板",
    },
    logId: "versions-log",
  }, "2026-09-17T10:01:00.000Z")).toMatchObject({
    status: "uploaded",
    douyinLogId: "versions-log",
  });
});
