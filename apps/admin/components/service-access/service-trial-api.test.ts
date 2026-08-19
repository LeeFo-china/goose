import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  applyForServiceTrial,
  canShowServiceTrialApplication,
  completeServiceTrialSubmission,
  createServiceTrialSubmissionIntent,
  formatServiceTrialError,
  getCurrentServiceTrial,
  getServiceTrialRecoveryCapabilities,
  getServiceTrialSectionVisibility,
  loadCurrentOrRecentServiceTrial,
  parseServiceTrialRequest,
  resolveServiceTrialEffectiveStatus,
  shouldClearSubmittedServiceTrial,
  type ServiceTrialRequest,
  type ServiceTrialRequester,
} from "./service-trial-api";
import {
  requestServiceAccessRefresh,
  type ServiceAccessRefreshRequester,
} from "./service-access-context";

const FIRST_KEY = "550e8400-e29b-41d4-a716-446655440000";
const SECOND_KEY = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

function readSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

type RequestCall = {
  path: string;
  init: Parameters<ServiceTrialRequester>[1];
};

function createRequester(responses: unknown[]): {
  requester: ServiceTrialRequester;
  calls: RequestCall[];
} {
  const calls: RequestCall[] = [];
  const requester: ServiceTrialRequester = async <Response>(
    path: string,
    init: Parameters<ServiceTrialRequester>[1],
  ) => {
    calls.push({ path, init });
    return responses.shift() as Response;
  };
  return { requester, calls };
}

const trial = {
  id: "f77db756-32c1-4b9f-a443-d2597587401b",
  status: "pending_review" as const,
  application_reason: "体验项目协作",
  expected_user_count: 10,
  expected_project_count: 3,
  contact_name: "张**",
  contact_phone: "138****8000",
  requested_at: "2026-08-19T08:00:00.000Z",
  reviewed_at: null,
  starts_at: null,
  trial_ends_at: null,
  grace_ends_at: null,
};

const request: ServiceTrialRequest = {
  applicationReason: "体验项目协作",
  expectedUserCount: 10,
  expectedProjectCount: 3,
  contactName: "张经理",
  contactPhone: "13800138000",
};

describe("service trial API adapter", () => {
  test("loads the current trial with the fixed recovery path", async () => {
    const { requester, calls } = createRequester([{
      trial,
      server_time: "2026-08-19T08:00:00.000Z",
    }]);

    const result = await getCurrentServiceTrial(requester);

    expect(result.trial).toEqual(trial);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe("/billing/service-trials/current");
    expect(calls[0]?.init?.method).toBeUndefined();
  });

  test("loads only page one with 20 items when current trial is empty", async () => {
    const { requester, calls } = createRequester([
      { trial: null, server_time: "2026-08-19T08:00:00.000Z" },
      {
        list: [trial],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        server_time: "2026-08-19T08:00:00.000Z",
      },
    ]);

    const result = await loadCurrentOrRecentServiceTrial(requester);

    expect(result).toEqual(trial);
    expect(calls.map(({ path }) => path)).toEqual([
      "/billing/service-trials/current",
      "/billing/service-trials?page=1&pageSize=20",
    ]);
  });

  test("does not load trial history when a current trial exists", async () => {
    const { requester, calls } = createRequester([{
      trial,
      server_time: "2026-08-19T08:00:00.000Z",
    }]);

    const result = await loadCurrentOrRecentServiceTrial(requester);

    expect(result).toEqual(trial);
    expect(calls.map(({ path }) => path)).toEqual([
      "/billing/service-trials/current",
    ]);
  });

  test("posts only the application fields and a UUID v4 idempotency key", async () => {
    const { requester, calls } = createRequester([{
      trial,
      idempotent: false,
      server_time: "2026-08-19T08:00:00.000Z",
    }]);

    await applyForServiceTrial(request, FIRST_KEY, requester);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe("/billing/service-trials/applications");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({
      application_reason: "体验项目协作",
      expected_user_count: 10,
      expected_project_count: 3,
      contact_name: "张经理",
      contact_phone: "13800138000",
      idempotency_key: FIRST_KEY,
    }));
    expect(calls[0]?.init?.body).not.toContain("tenant");
    expect(calls[0]?.init?.body).not.toContain("trial_id");
    expect(FIRST_KEY).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  test("preserves backend client errors with code and requestId", async () => {
    const backendError = Object.assign(new Error("申请记录已存在"), {
      code: "SERVICE_TRIAL_PENDING_EXISTS",
      requestId: "request-trace-id",
    });
    const requester: ServiceTrialRequester = () => Promise.reject(backendError);

    const caught = getCurrentServiceTrial(requester).catch((error: unknown) => error);

    expect(await caught).toBe(backendError);
  });
});

describe("service trial submission intent", () => {
  test("reuses a key after failure and rotates only when fields change", () => {
    const keys = [FIRST_KEY, SECOND_KEY];
    const intent = createServiceTrialSubmissionIntent(() => {
      const key = keys.shift();
      if (!key) throw new Error("测试幂等键不足");
      return key;
    });

    expect(intent.keyFor(request)).toBe(FIRST_KEY);
    expect(intent.keyFor(request)).toBe(FIRST_KEY);
    expect(intent.keyFor({ ...request, expectedProjectCount: 4 })).toBe(SECOND_KEY);
  });

  test("clears the successful intent before the next submission", () => {
    const keys = [FIRST_KEY, SECOND_KEY];
    const intent = createServiceTrialSubmissionIntent(() => {
      const key = keys.shift();
      if (!key) throw new Error("测试幂等键不足");
      return key;
    });

    expect(intent.keyFor(request)).toBe(FIRST_KEY);
    intent.clearAfterSuccess();
    expect(intent.keyFor(request)).toBe(SECOND_KEY);
  });

  test("clears an existing intent as soon as a form field changes", () => {
    const keys = [FIRST_KEY, SECOND_KEY];
    const intent = createServiceTrialSubmissionIntent(() => {
      const key = keys.shift();
      if (!key) throw new Error("测试幂等键不足");
      return key;
    });

    expect(intent.keyFor(request)).toBe(FIRST_KEY);
    intent.clearAfterChange();
    expect(intent.keyFor(request)).toBe(SECOND_KEY);
  });

  test("uses crypto.randomUUID to create a real UUID v4 by default", () => {
    const key = createServiceTrialSubmissionIntent().keyFor(request);

    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe("service trial recovery rules", () => {
  test("requires both summary action and matching permission", () => {
    expect(getServiceTrialRecoveryCapabilities(
      ["apply_trial", "view_trial"],
      ["billing.service_trial.apply", "billing.service_trial.read"],
    )).toEqual({ canApply: true, canView: true });
    expect(getServiceTrialRecoveryCapabilities(
      ["apply_trial", "view_trial"],
      ["billing.service_trial.read"],
    )).toEqual({ canApply: false, canView: true });
    expect(getServiceTrialRecoveryCapabilities(
      [],
      ["billing.service_trial.apply", "billing.service_trial.read"],
    )).toEqual({ canApply: false, canView: false });
  });

  test("does not expose repeat application for pending or scheduled trials", () => {
    expect(canShowServiceTrialApplication(true, null)).toBe(true);
    expect(canShowServiceTrialApplication(true, "expired")).toBe(true);
    expect(canShowServiceTrialApplication(true, "pending_review")).toBe(false);
    expect(canShowServiceTrialApplication(true, "scheduled")).toBe(false);
    expect(canShowServiceTrialApplication(false, null)).toBe(false);
  });

  test("parses a valid form using the API field boundaries", () => {
    expect(parseServiceTrialRequest({
      applicationReason: " 体验项目协作 ",
      expectedUserCount: "10",
      expectedProjectCount: "3",
      contactName: " 张经理 ",
      contactPhone: " 13800138000 ",
    })).toEqual({
      success: true,
      data: request,
    });
  });

  test("rejects values outside the API field boundaries", () => {
    const invalidCases = [
      { field: "applicationReason", value: "", message: "请输入试用目的" },
      { field: "applicationReason", value: "目".repeat(1001), message: "试用目的不能超过 1000 个字符" },
      { field: "expectedUserCount", value: "0", message: "预计使用人数须为 1 到 10000 的整数" },
      { field: "expectedUserCount", value: "1.5", message: "预计使用人数须为 1 到 10000 的整数" },
      { field: "expectedProjectCount", value: "100001", message: "预计项目数量须为 1 到 100000 的整数" },
      { field: "contactName", value: "", message: "请输入联系人" },
      { field: "contactName", value: "张".repeat(61), message: "联系人不能超过 60 个字符" },
      { field: "contactPhone", value: "12345678901", message: "请输入正确的中国大陆手机号" },
    ] as const;

    for (const invalid of invalidCases) {
      const result = parseServiceTrialRequest({
        applicationReason: "体验项目协作",
        expectedUserCount: "10",
        expectedProjectCount: "3",
        contactName: "张经理",
        contactPhone: "13800138000",
        [invalid.field]: invalid.value,
      });
      expect(result).toEqual({ success: false, message: invalid.message });
    }
  });

  test("formats only a safe message and requestId from backend errors", () => {
    const error = Object.assign(new Error("申请记录已存在"), {
      requestId: "request-trace-id",
      payload: { contact_phone: "13800138000" },
    });

    expect(formatServiceTrialError(error, "操作失败")).toBe(
      "申请记录已存在（Request-ID：request-trace-id）",
    );
    expect(formatServiceTrialError({ requestId: 123 }, "操作失败")).toBe(
      "操作失败",
    );
  });

  test("installs the command trial and parent feedback before summary refresh", async () => {
    const events: string[] = [];

    await completeServiceTrialSubmission({
      trial,
      installTrial: (submittedTrial) => {
        expect(submittedTrial).toBe(trial);
        events.push(`trial:${submittedTrial.status}`);
      },
      showFeedback: (feedback) => {
        events.push(`feedback:${feedback.message}`);
      },
      refreshSummary: async () => {
        events.push("summary:refresh");
        return { success: true };
      },
    });

    expect(events).toEqual([
      "trial:pending_review",
      "feedback:试用申请已提交，请等待平台审核。",
      "summary:refresh",
    ]);
  });

  test("uses the real context refresh result to preserve safe failure feedback", async () => {
    const feedbackMessages: string[] = [];
    const refreshError = Object.assign(new Error("服务状态刷新失败"), {
      requestId: "summary-request-id",
      payload: { contact_phone: "13800138000" },
    });
    const paths: string[] = [];
    const requester: ServiceAccessRefreshRequester = <Response>(path: string) => {
      paths.push(path);
      return Promise.reject(refreshError) as Promise<Response>;
    };
    const outcome = await requestServiceAccessRefresh(requester);

    expect(paths).toEqual(["/employee/service-access"]);
    expect(outcome.loadResult).toEqual({
      kind: "unavailable",
      message: "服务状态暂时无法加载，请稍后重试",
    });
    expect(outcome.result).toEqual({
      success: false,
      message: "服务状态刷新失败",
      requestId: "summary-request-id",
    });
    expect(JSON.stringify(outcome)).not.toContain("13800138000");

    await completeServiceTrialSubmission({
      trial,
      installTrial: () => undefined,
      showFeedback: (feedback) => feedbackMessages.push(feedback.message),
      refreshSummary: async () => outcome.result,
    });

    expect(feedbackMessages).toEqual([
      "试用申请已提交，请等待平台审核。",
      "试用申请已提交。服务状态刷新失败（Request-ID：summary-request-id）",
    ]);
    expect(feedbackMessages.join(" ")).not.toContain("13800138000");
  });

  test("keeps post-submit feedback in the section when the form hides", () => {
    const formSource = readSource("./service-trial-form.tsx");
    const sectionSource = readSource("./service-trial-section.tsx");
    const workspaceSource = readSource("./service-access-workspace.tsx");

    expect(formSource).toContain("submittedTrial = response.trial");
    expect(formSource).toContain("await onSubmitted(submittedTrial)");
    expect(formSource).not.toContain("试用申请已提交，请等待平台审核。");
    expect(sectionSource).toContain("const [submitFeedback, setSubmitFeedback]");
    expect(sectionSource).toContain("<SubmitFeedback message={submitFeedback}");
    expect(sectionSource).not.toContain("canDisplayTrial");
    expect(sectionSource).toContain("visibility.showTrialDetails");
    expect(sectionSource).toContain("visibility.showContactAdministrator");
    expect(sectionSource).not.toContain("await loadTrial()");
    expect(workspaceSource).toContain(
      "hasEnteredRecovery && loadResult.kind === \"unavailable\"",
    );
    expect(canShowServiceTrialApplication(true, "pending_review")).toBe(false);
    expect(formSource).not.toContain("finally {\n      setSubmitting(false)");
  });

  test("lets a later authoritative rejection supersede local pending state", () => {
    const localPending = resolveServiceTrialEffectiveStatus({
      loadedTrialStatus: null,
      submittedTrialStatus: "pending_review",
      summaryStatusAtSubmit: "expired",
      summaryTrialStatus: "expired",
    });
    const authoritativeRejected = resolveServiceTrialEffectiveStatus({
      loadedTrialStatus: null,
      submittedTrialStatus: "pending_review",
      summaryStatusAtSubmit: "expired",
      summaryTrialStatus: "rejected",
    });

    expect(localPending).toBe("pending_review");
    expect(authoritativeRejected).toBe("rejected");
    expect(shouldClearSubmittedServiceTrial({
      summaryStatusAtSubmit: "expired",
      summaryTrialStatus: "rejected",
    })).toBe(true);
    expect(canShowServiceTrialApplication(true, authoritativeRejected)).toBe(true);
  });

  test("never treats submit feedback as trial read authorization", () => {
    expect(getServiceTrialSectionVisibility({
      canApply: false,
      canView: false,
      hasSubmitFeedback: true,
    })).toEqual({
      showTrialDetails: false,
      showSubmitFeedback: true,
      showContactAdministrator: true,
    });
    expect(getServiceTrialSectionVisibility({
      canApply: true,
      canView: false,
      hasSubmitFeedback: true,
    })).toEqual({
      showTrialDetails: false,
      showSubmitFeedback: true,
      showContactAdministrator: false,
    });
    expect(getServiceTrialSectionVisibility({
      canApply: false,
      canView: true,
      hasSubmitFeedback: true,
    })).toEqual({
      showTrialDetails: true,
      showSubmitFeedback: true,
      showContactAdministrator: false,
    });
  });

  test("uses an HTML phone pattern that accepts a mainland mobile number", () => {
    const formSource = readSource("./service-trial-form.tsx");
    const pattern = formSource.match(/pattern="([^"]+)"/)?.[1];
    if (!pattern) throw new Error("未找到手机号 pattern");

    expect(pattern).toBe("^1[3-9][0-9]{9}$");
    expect(new RegExp(pattern).test("13800138000")).toBe(true);
  });
});
