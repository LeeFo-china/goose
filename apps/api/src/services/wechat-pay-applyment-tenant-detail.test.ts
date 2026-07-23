import { describe, expect, mock, test } from "bun:test";
import type {
  WechatPayApplymentEventRecord,
  WechatPayApplymentRecord,
} from "@/repositories/wechat-pay-applyments";
import { buildTenantApplymentDetail } from "@/services/wechat-pay-applyment-tenant-detail";

const applyment = {
  id: "33333333-3333-4333-8333-333333333333",
  tenant_id: "11111111-1111-4111-8111-111111111111",
  status: "draft",
} as WechatPayApplymentRecord;
const events = [] as WechatPayApplymentEventRecord[];

describe("buildTenantApplymentDetail", () => {
  test("uses the loaded applyment and keeps lifecycle readiness separate", async () => {
    const run = mock(async () => ({ ready: true, blockers: [] }));
    const runForApplyment = mock(async () => ({
      ready: false,
      blockers: [{ code: "APPLYMENT_STATUS_NOT_SUBMITTABLE" }],
    }));
    const result = await buildTenantApplymentDetail({
      applyment,
      canEdit: true,
      repository: { findEvents: async () => events },
      preflightService: { run, runForApplyment },
    });

    expect(run).not.toHaveBeenCalled();
    expect(runForApplyment).toHaveBeenCalledWith(applyment);
    expect(result.submission_readiness).toEqual({
      ready: false,
      review_ready: true,
      blockers: [{ code: "APPLYMENT_STATUS_NOT_SUBMITTABLE" }],
    });
    expect(result.can_submit).toBe(true);
  });

  test("blocks submit for business readiness without changing edit permission", async () => {
    const result = await buildTenantApplymentDetail({
      applyment,
      canEdit: true,
      repository: { findEvents: async () => events },
      preflightService: {
        run: async () => ({
          ready: false,
          blockers: [{
            code: "APPLYMENT_REQUIRED_FIELD_MISSING",
            field: "service_phone",
          }],
        }),
      },
    });

    expect(result.submission_readiness?.review_ready).toBe(false);
    expect(result.can_edit).toBe(true);
    expect(result.can_submit).toBe(false);
  });

  test("does not turn business readiness into tenant permission", async () => {
    const result = await buildTenantApplymentDetail({
      applyment,
      canEdit: false,
      repository: { findEvents: async () => events },
      preflightService: {
        run: async () => ({ ready: true, blockers: [] }),
      },
    });

    expect(result.submission_readiness?.review_ready).toBe(true);
    expect(result.can_edit).toBe(false);
    expect(result.can_submit).toBe(false);
  });
});
