import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const MOCK_BACKEND_URL = "http://127.0.0.1:3998";

async function loginAsTenantAdmin(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: "18800000001", code: "" },
  });
  expect(response.ok()).toBe(true);
}

function stageButton(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(`\\d+\\.\\s*${label}`) });
}

test.beforeEach(async ({ request }) => {
  const response = await request.post(`${MOCK_BACKEND_URL}/__test/reset`);
  expect(response.ok()).toBe(true);
});

test("集中展示 readiness 阻塞项并定位到首个未完成阶段", async ({
  page,
  request,
}) => {
  const defaultResponse = await request.get(
    `${MOCK_BACKEND_URL}/finance/wechat-pay/applyment/current`,
  );
  const defaultDetail = await defaultResponse.json() as {
    data: {
      can_submit: boolean;
      submission_readiness: {
        ready: boolean;
        review_ready: boolean;
        blockers: Array<{ code: string }>;
      };
    };
  };
  expect(defaultDetail.data).toMatchObject({
    can_submit: true,
    submission_readiness: {
      ready: false,
      review_ready: true,
      blockers: [{ code: "APPLYMENT_STATUS_NOT_SUBMITTABLE" }],
    },
  });

  const readinessResponse = await request.post(
    `${MOCK_BACKEND_URL}/__test/readiness`,
    {
      data: {
        blockers: [
          {
            code: "APPLYMENT_REQUIRED_ATTACHMENT_MISSING",
            category: "legal_representative_id_card_back",
          },
          {
            code: "APPLYMENT_ATTACHMENT_OCR_REVIEW_REQUIRED",
            category: "legal_representative_id_card_front",
          },
          {
            code: "APPLYMENT_REQUIRED_FIELD_MISSING",
            field: "super_admin_name",
          },
          {
            code: "APPLYMENT_REQUIRED_FIELD_MISSING",
            field: "sensitive.contact_name",
          },
          { code: "APPLYMENT_FUTURE_BLOCKER" },
        ],
      },
    },
  );
  expect(readinessResponse.ok()).toBe(true);
  const blockedResponse = await request.get(
    `${MOCK_BACKEND_URL}/finance/wechat-pay/applyment/current`,
  );
  const blockedDetail = await blockedResponse.json() as {
    data: {
      can_submit: boolean;
      submission_readiness: {
        ready: boolean;
        review_ready: boolean;
        blockers: Array<{ code: string }>;
      };
    };
  };
  expect(blockedDetail.data.can_submit).toBe(false);
  expect(blockedDetail.data.submission_readiness).toMatchObject({
    ready: false,
    review_ready: false,
  });
  expect(blockedDetail.data.submission_readiness.blockers).toHaveLength(5);

  await loginAsTenantAdmin(page);
  await page.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });
  await expect(stageButton(page, "上传资料")).toHaveAttribute(
    "aria-current",
    "step",
  );

  const nextButton = page.getByRole("button", { name: "下一步" });
  await nextButton.click();
  await nextButton.click();
  await nextButton.click();

  await expect(stageButton(page, "确认提交")).toHaveAttribute(
    "aria-current",
    "step",
  );
  const alert = page.getByRole("alert").filter({
    hasText: "还有 4 项需要处理",
  });
  await expect(alert).toContainText("缺少法人身份证国徽面");
  await expect(alert).toContainText("请核对法人身份证人像面识别结果");
  await expect(alert).toContainText("请核对超级管理员姓名");
  await expect(alert).toContainText("申请资料尚未满足提交条件");
  await expect(alert.locator("[data-readiness-blocker]")).toHaveCount(4);

  await alert.getByRole("button", {
    name: "缺少法人身份证国徽面",
  }).click();
  await expect(stageButton(page, "上传资料")).toHaveAttribute(
    "aria-current",
    "step",
  );
  await stageButton(page, "确认提交").click();
  await page.getByRole("alert").getByRole("button", {
    name: "请核对法人身份证人像面识别结果",
  }).click();
  await expect(stageButton(page, "核对识别")).toHaveAttribute(
    "aria-current",
    "step",
  );
});
