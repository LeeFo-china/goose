import { aiGateway, GOAL_LABELS, STYLE_LABELS, SYSTEM_PROMPT, TARGET_PLATFORM_LABELS, TARGET_PLATFORM_PROMPTS } from "./shared";
import type { OpenAiRequestBody, SocialVideoScriptGoal, SocialVideoScriptStyle, SocialVideoScriptTargetPlatform } from "./shared";
import { normalizeAiPayload, parseJsonObject } from "./normalization";

export function buildUserPrompt(input: {
  targetPlatform: SocialVideoScriptTargetPlatform;
  style: SocialVideoScriptStyle;
  durationSeconds: number;
  goal: SocialVideoScriptGoal;
  title: string | null;
  text: string;
}) {
  return [
    `目标发布平台：${TARGET_PLATFORM_LABELS[input.targetPlatform]} (${input.targetPlatform})`,
    `平台内容要求：${TARGET_PLATFORM_PROMPTS[input.targetPlatform]}`,
    `目标风格：${STYLE_LABELS[input.style]} (${input.style})`,
    `目标时长：${input.durationSeconds} 秒`,
    `内容目标：${GOAL_LABELS[input.goal]} (${input.goal})`,
    "",
    "原始视频标题：",
    input.title || "未提供",
    "",
    "原始转写文本：",
    input.text,
  ].join("\n");
}

export async function callAi(input: {
  tenantId?: string | null;
  source?: string | null;
  authUserId?: string | null;
  transcriptionId?: string;
  targetPlatform: SocialVideoScriptTargetPlatform;
  style: SocialVideoScriptStyle;
  durationSeconds: number;
  goal: SocialVideoScriptGoal;
  title: string | null;
  text: string;
}) {
  const messages: OpenAiRequestBody["messages"] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(input) },
  ];

  let result: Awaited<ReturnType<typeof aiGateway.chat>>;
  try {
    result = await aiGateway.chat({
      sceneCode: "social_video_script",
      tenantId: input.tenantId,
      source: input.source,
      temperature: 0.45,
      messages,
      responseFormat: "json_object",
      metadata: {
        auth_user_id: input.authUserId ?? null,
        transcription_id: input.transcriptionId ?? null,
        target_platform: input.targetPlatform,
        style: input.style,
        duration_seconds: input.durationSeconds,
        goal: input.goal,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 生成拍摄脚本失败";
    if (!message.includes("response_format")) {
      throw error;
    }
    result = await aiGateway.chat({
      sceneCode: "social_video_script",
      tenantId: input.tenantId,
      source: input.source,
      temperature: 0.45,
      messages,
      metadata: {
        auth_user_id: input.authUserId ?? null,
        transcription_id: input.transcriptionId ?? null,
        target_platform: input.targetPlatform,
        style: input.style,
        duration_seconds: input.durationSeconds,
        goal: input.goal,
      },
    });
  }

  const content = result.content;
  let payload = parseJsonObject(content);

  try {
    return {
      payload: normalizeAiPayload(payload),
      rawPayload: result.raw,
      model: result.modelName,
      provider: result.provider,
    };
  } catch (error) {
    result = await aiGateway.chat({
      sceneCode: "social_video_script",
      tenantId: input.tenantId,
      source: input.source,
      temperature: 0.25,
      messages: [
        ...messages,
        {
          role: "assistant",
          content,
        },
        {
          role: "user",
          content: "上一次输出结构不合规。请只返回合法 JSON，必须包含完整字段，shooting_script 至少 3 条。",
        },
      ],
      responseFormat: "json_object",
      metadata: {
        auth_user_id: input.authUserId ?? null,
        transcription_id: input.transcriptionId ?? null,
        target_platform: input.targetPlatform,
        style: input.style,
        duration_seconds: input.durationSeconds,
        goal: input.goal,
        repair_attempt: true,
      },
    });
    payload = parseJsonObject(result.content);

    return {
      payload: normalizeAiPayload(payload),
      rawPayload: result.raw,
      model: result.modelName,
      provider: result.provider,
    };
  }
}
