import { describe, expect, mock, test } from "bun:test";

import type { DouyinContentInstallation } from "@/repositories/douyin-miniapp-content";
import type { AiGatewayChatInput } from "@/services/ai-gateway";
import type { JwtPayload } from "@/utils/jwt";
import { DouyinMiniappQaService } from "./qa";

const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const INSTALLATION_ID = "44444444-4444-4444-8444-444444444444";
const APP_ID = "tt-app";

const user: JwtPayload = {
  token_type: "douyin_miniapp",
  tenant_id: TENANT_ID,
  douyin_installation_id: INSTALLATION_ID,
  douyin_app_id: APP_ID,
};

const attribution = {
  entry_path: "pages/qa/index" as const,
  scene: "021001",
  source_type: "direct" as const,
};

describe("DouyinMiniappQaService", () => {
  test("returns a bounded AI answer that directly responds to the user question", async () => {
    const chatCalls: AiGatewayChatInput[] = [];
    const chat = mock(async (input: AiGatewayChatInput) => {
      chatCalls.push(input);
      return {
        content: JSON.stringify({
          answer_points: [
            "我是装修问题助手，可以围绕预算、旧房、局部改造和量房准备给出参考。",
            "你可以直接描述房屋现状和想解决的问题，我会先给出沟通建议。",
          ],
          suggested_questions: ["旧房翻新要先看哪些地方？", "量房前需要准备什么？"],
        }),
        provider: "deepseek",
        model: "deepseek-chat",
      };
    });
    const findActiveInstallation = mock(activeInstallation);
    const service = new DouyinMiniappQaService({
      aiGateway: { chat },
      contextRepository: { findActiveInstallation },
    });

    await expect(service.ask(user, {
      question: "你是做什么的？",
      attribution,
    })).resolves.toEqual({
      answer_points: [
        "我是装修问题助手，可以围绕预算、旧房、局部改造和量房准备给出参考。",
        "你可以直接描述房屋现状和想解决的问题，我会先给出沟通建议。",
      ],
      suggested_questions: [
        "旧房翻新要先看哪些地方？",
        "量房前需要准备什么？",
      ],
      disclaimer: "以上内容仅供装修沟通参考，具体方案以现场量房为准。",
    });
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({
      sceneCode: "decoration_qa",
      tenantId: user.tenant_id,
      responseFormat: "json_object",
      source: "douyin_miniapp",
      billable: true,
    }));
    const prompt = JSON.stringify(chatCalls[0]?.messages);
    expect(prompt).toContain("你是做什么的？");
    expect(prompt).toContain("直接回答用户当前问题");
    expect(prompt).not.toContain("15518591857");
    expect(findActiveInstallation).toHaveBeenCalledWith({
      installationId: INSTALLATION_ID,
      tenantId: TENANT_ID,
      appId: APP_ID,
    });
  });

  test("rejects unsafe personal information before gateway call", async () => {
    const chat = mock(async () => ({ content: "{}", provider: "p", model: "m" }));
    const service = new DouyinMiniappQaService({
      aiGateway: { chat },
      contextRepository: { findActiveInstallation: mock(activeInstallation) },
    });

    for (const question of [
      "我手机号15518591857，装修怎么弄？",
      "人民路88号怎么装修？",
      "加我微信 abcdef",
    ]) {
      await expect(service.ask(user, { question, attribution }))
        .rejects.toMatchObject({
          statusCode: 400,
          code: "DOUYIN_QA_INPUT_UNSAFE",
        });
    }
    expect(chat).not.toHaveBeenCalled();
  });

  test("does not reject ordinary decoration wording that mentions phone wiring", async () => {
    const service = new DouyinMiniappQaService({
      contextRepository: { findActiveInstallation: mock(activeInstallation) },
      aiGateway: {
        chat: mock(async () => ({
          content: JSON.stringify({
            answer_points: ["电话线和网线改造建议先确认弱电箱位置、走线路径和是否需要保留原有接口。"],
            suggested_questions: ["局部装修适合先确认什么？"],
          }),
          provider: "deepseek",
          model: "deepseek-chat",
        })),
      },
    });

    await expect(service.ask(user, {
      question: "电话线和网线改造要注意什么？",
      attribution,
    })).resolves.toMatchObject({
      answer_points: expect.arrayContaining([
        "电话线和网线改造建议先确认弱电箱位置、走线路径和是否需要保留原有接口。",
      ]),
    });
  });


  test("falls back to a deterministic safe answer when AI output is invalid", async () => {
    const service = new DouyinMiniappQaService({
      contextRepository: { findActiveInstallation: mock(activeInstallation) },
      aiGateway: {
        chat: mock(async () => ({
          content: JSON.stringify({
            answer_code: "unknown",
            free_text: "拨打 15518591857 获取报价",
          }),
          provider: "deepseek",
          model: "deepseek-chat",
        })),
      },
    });

    await expect(service.ask(user, {
      question: "你是做什么的？",
      attribution,
    })).resolves.toEqual({
      answer_points: [
        "我是装修问题助手，可以围绕预算、旧房翻新、局部改造和量房准备给出参考。",
        "如果问题不够明确，可以补充房屋现状、装修范围或想解决的具体问题。",
      ],
      suggested_questions: [
        "装修预算前要先准备哪些信息？",
        "局部装修适合先确认什么？",
      ],
      disclaimer: "以上内容仅供装修沟通参考，具体方案以现场量房为准。",
    });
  });

  test("drops unsafe AI answer text before returning to the miniapp", async () => {
    const service = new DouyinMiniappQaService({
      contextRepository: { findActiveInstallation: mock(activeInstallation) },
      aiGateway: {
        chat: mock(async () => ({
          content: JSON.stringify({
            answer_points: [
              "可以拨打 15518591857 直接咨询，预算报价 10 万元左右。",
            ],
            suggested_questions: ["怎么联系你？"],
          }),
          provider: "deepseek",
          model: "deepseek-chat",
        })),
      },
    });

    const response = await service.ask(user, {
      question: "你是做什么的？",
      attribution,
    });

    expect(JSON.stringify(response)).not.toContain("15518591857");
    expect(JSON.stringify(response)).not.toContain("10 万元");
    expect(response.answer_points).toEqual([
      "我是装修问题助手，可以围绕预算、旧房翻新、局部改造和量房准备给出参考。",
      "如果问题不够明确，可以补充房屋现状、装修范围或想解决的具体问题。",
    ]);
  });

  test("requires a Douyin miniapp session scope", async () => {
    const findActiveInstallation = mock(activeInstallation);
    const service = new DouyinMiniappQaService({ aiGateway: {
      chat: mock(async () => ({ content: "{}", provider: "p", model: "m" })),
    }, contextRepository: { findActiveInstallation } });

    await expect(service.ask({ token_type: "auth", tenant_id: user.tenant_id }, {
      question: "装修预算怎么准备？",
      attribution,
    })).rejects.toMatchObject({ statusCode: 401 });
    expect(findActiveInstallation).not.toHaveBeenCalled();
  });

  test("rejects disabled or mismatched miniapp installations before gateway call", async () => {
    const chat = mock(async () => ({ content: "{}", provider: "p", model: "m" }));
    const service = new DouyinMiniappQaService({
      aiGateway: { chat },
      contextRepository: { findActiveInstallation: mock(async () => null) },
    });

    await expect(service.ask(user, {
      question: "装修预算怎么准备？",
      attribution,
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "DOUYIN_MINIAPP_DISABLED",
    });
    expect(chat).not.toHaveBeenCalled();
  });
});

function activeInstallation(): Promise<DouyinContentInstallation> {
  return Promise.resolve({
    id: INSTALLATION_ID,
    tenant_id: TENANT_ID,
    authorizer_appid: APP_ID,
    authorization_status: "active" as const,
    template_version: "0.1.5",
    deployment_key: "merchant-dev",
    installation_kind: "merchant" as const,
    runtime_config: {
      brand: { logo_url: null, qualifications: [] },
      theme: { primary_color: "#191817", navigation_text_color: "black" },
      features: {
        cases: true,
        sites: true,
        sms_lead: true,
        douyin_phone: false,
        phone_capture_mode: "sms",
      },
      home_banners: [],
      trust_metrics: [],
      privacy_policy_version: "2026-08-25",
    },
    tenant: { id: TENANT_ID, status: "active" as const },
  });
}
