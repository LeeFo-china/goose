import { describe, expect, test } from "bun:test";

import { ApiClient, type TransportInput } from "./request";
import { askDecorationQuestion } from "./qa";

const attribution = {
  entry_path: "pages/qa/index" as const,
  scene: "021001",
  source_type: "direct" as const,
};

function clientWith(handler: (input: TransportInput) => unknown): ApiClient {
  return new ApiClient(
    { send: async (input) => handler(input) },
    {
      getAccessToken: async () => "test-token",
      refreshAfterUnauthorized: async () => "refreshed-token",
    },
  );
}

describe("Douyin decoration Q&A API client", () => {
  test("posts a bounded question with launch attribution and parses exact safe answers", async () => {
    const calls: TransportInput[] = [];
    const answer = {
      answer_points: [
        "量房前先确认装修范围、房屋现状和入住计划。",
        "旧房翻新要重点看水电、墙地面和防水。",
      ],
      suggested_questions: ["装修预算前要准备什么？", "局部装修怎么规划？"],
      disclaimer: "以上内容仅供装修沟通参考，具体方案以现场量房为准。",
    };
    const client = clientWith((input) => {
      calls.push(input);
      return answer;
    });

    await expect(askDecorationQuestion(client, {
      question: "旧房翻新要注意什么？",
      attribution,
    })).resolves.toEqual(answer);
    expect(calls).toEqual([{
      path: "/douyin-mini/qa",
      method: "POST",
      data: {
        question: "旧房翻新要注意什么？",
        attribution,
      },
      token: "test-token",
      timeoutMs: 30_000,
    }]);
  });

  test("rejects malformed or unsafe API responses", async () => {
    const valid = {
      answer_points: ["量房前先确认装修范围。"],
      suggested_questions: ["装修预算前要准备什么？"],
      disclaimer: "以上内容仅供装修沟通参考，具体方案以现场量房为准。",
    };
    for (const invalid of [
      { ...valid, answer_points: [] },
      { ...valid, answer_points: ["x".repeat(121)] },
      { ...valid, suggested_questions: ["装修预算前要准备什么？", "装修预算前要准备什么？"] },
      { ...valid, phone: "15518591857" },
    ]) {
      await expect(askDecorationQuestion(clientWith(() => invalid), {
        question: "装修预算怎么准备？",
        attribution,
      })).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    }
  });
});
