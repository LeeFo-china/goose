import { Errors } from "@/errors/error-factory";
import { aiGateway } from "@/services/ai-gateway";
import {
  socialVideoScriptRepository,
  type SocialVideoScriptRecord,
} from "@/repositories/social-video-scripts";
import { socialVideoTranscriptionRepository } from "@/repositories/social-video-transcriptions";
import type {
  CreateSocialVideoScriptInput,
  ListSocialVideoScriptsQuery,
  SocialVideoScriptGoal,
  SocialVideoScriptStyle,
  SocialVideoScriptTargetPlatform,
} from "@/schema/social-video";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { systemSettingsService } from "@/services/system-settings";

type AiMessageRole = "system" | "user" | "assistant";

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type OpenAiRequestBody = {
  model: string;
  temperature: number;
  messages: Array<{ role: AiMessageRole; content: string }>;
  response_format?: { type: "json_object" };
};

type ShootingScriptScene = {
  scene: number;
  duration: string;
  shot: string;
  voiceover: string;
  caption: string;
};

type NormalizedScriptPayload = {
  title: string;
  hook: string;
  rewritten_copy: string;
  shooting_script: ShootingScriptScene[];
  cover_text_options: string[];
  caption_options: string[];
  tips: string[];
};

const PROMPT_VERSION = "social-video-script-v2";

const STYLE_LABELS: Record<SocialVideoScriptStyle, string> = {
  practical: "实用口播",
  seeding: "种草分享",
  professional: "专业可信",
  down_to_earth: "接地气",
  douyin_practical: "抖音实用口播",
  xiaohongshu: "小红书种草",
};

const TARGET_PLATFORM_LABELS: Record<SocialVideoScriptTargetPlatform, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  shipinhao: "视频号",
  kuaishou: "快手",
};

const TARGET_PLATFORM_PROMPTS: Record<SocialVideoScriptTargetPlatform, string> = {
  douyin: "抖音内容更重开头 3 秒、强痛点、口播节奏和明确互动引导。",
  xiaohongshu: "小红书内容更重真实体验、生活化表达、封面标题和轻种草，不要像硬广。",
  shipinhao: "视频号内容更重可信度、专业感和稳重表达，适合业主和熟人社交传播。",
  kuaishou: "快手内容更重直接、真实、接地气和强互动，表达要口语化。",
};

const GOAL_LABELS: Record<SocialVideoScriptGoal, string> = {
  lead_generation: "引流咨询",
  education: "装修科普",
  case_seeding: "案例种草",
  brand_trust: "品牌信任",
};

const SYSTEM_PROMPT = [
  "你是装修公司自媒体短视频脚本策划助手。",
  "你需要基于用户提供的视频转写文本，改写成适合中国本地装修公司账号发布的短视频脚本。",
  "要求：",
  "1. 内容必须围绕装修、施工、设计、验收、避坑、案例或客户沟通。",
  "2. 不要编造具体价格、工期、品牌承诺和无法验证的数据。",
  "3. 语气要适合中国本地装修公司短视频账号。",
  "4. 输出必须是 JSON，不要输出 Markdown。",
  "5. 必须包含 title、hook、rewritten_copy、shooting_script、cover_text_options、caption_options、tips。",
  "6. shooting_script 每条包含 scene、duration、shot、voiceover、caption。",
  "7. shooting_script 至少 3 条，最多 8 条。",
].join("\n");

function firstNonEmptyEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return "";
}

function requireAiEnv(names: string[], label: string) {
  const value = firstNonEmptyEnv(names);
  if (!value) {
    throw Errors.business(503, `缺少 AI 配置: ${label}`, "SOCIAL_VIDEO_SCRIPT_AI_CONFIG_MISSING");
  }

  return value;
}

async function getAiEndpoint() {
  const hasDeepSeekApiKey = Boolean(await systemSettingsService.getSecretString("DEEPSEEK_API_KEY"));
  return (await systemSettingsService.getString("AI_CHAT_COMPLETIONS_URL"))
    || (hasDeepSeekApiKey
      ? "https://api.deepseek.com/chat/completions"
      : "https://api.openai.com/v1/chat/completions");
}

async function getAiApiKey(endpoint: string) {
  const envNames = endpoint.includes("api.deepseek.com")
    ? ["DEEPSEEK_API_KEY", "AI_API_KEY"]
    : ["AI_API_KEY", "DEEPSEEK_API_KEY"];

  for (const name of envNames) {
    const value = await systemSettingsService.getSecretString(name);
    if (value) return value;
  }

  return requireAiEnv(envNames, "AI_API_KEY / DEEPSEEK_API_KEY");
}

async function getAiModel(endpoint: string) {
  const explicit = await systemSettingsService.getString("SOCIAL_VIDEO_SCRIPT_AI_MODEL");
  if (explicit) return explicit;

  const shared = await systemSettingsService.getString("AI_MODEL");
  if (shared) return shared;

  if (endpoint.includes("api.deepseek.com")) {
    return "deepseek-chat";
  }

  throw Errors.business(
    503,
    "缺少 AI 模型配置",
    "SOCIAL_VIDEO_SCRIPT_AI_CONFIG_MISSING",
  );
}

async function getAiRequestTimeoutMs() {
  const parsed = await systemSettingsService.getNumber("SOCIAL_VIDEO_SCRIPT_AI_TIMEOUT_MS", 25000);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 25000;
  }

  return Math.max(5000, Math.min(parsed, 60000));
}

async function getOpenRouterHeaders(endpoint: string): Promise<Record<string, string>> {
  if (!endpoint.includes("openrouter.ai")) {
    return {};
  }

  return {
    "HTTP-Referer": await systemSettingsService.getString(
      "OPENROUTER_HTTP_REFERER",
      "https://gooes.local",
    ),
    "X-Title": await systemSettingsService.getString(
      "OPENROUTER_APP_NAME",
      "gooes-social-video-script",
    ),
  };
}

function getModelProvider(endpoint: string) {
  if (endpoint.includes("api.deepseek.com")) return "deepseek";
  if (endpoint.includes("openrouter.ai")) return "openrouter";
  if (endpoint.includes("api.openai.com")) return "openai";
  return "custom";
}

async function buildHeaders(apiKey: string, endpoint: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
    ...await getOpenRouterHeaders(endpoint),
  };
}

function extractContent(content: OpenAiChatResponse["choices"]) {
  const rawContent = content?.[0]?.message?.content;
  if (typeof rawContent === "string") return rawContent;
  if (Array.isArray(rawContent)) {
    return rawContent.map((item) => item.text || "").join("").trim();
  }
  return "";
}

function parseJsonObject(content: string) {
  const trimmed = content.trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
  }

  return {};
}

async function requestAiResult(
  endpoint: string,
  apiKey: string,
  requestBody: OpenAiRequestBody,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), await getAiRequestTimeoutMs());

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: await buildHeaders(apiKey, endpoint),
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({})) as OpenAiChatResponse;

    if (!response.ok) {
      throw Errors.business(
        502,
        result.error?.message || "AI 生成拍摄脚本失败",
        "SOCIAL_VIDEO_SCRIPT_AI_FAILED",
        { statusCode: response.status },
      );
    }

    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw Errors.business(504, "AI 生成拍摄脚本超时", "SOCIAL_VIDEO_SCRIPT_AI_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function truncateByChars(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join("");
}

function readString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return truncateByChars(value.trim(), maxLength);
}

function readStringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeShootingScript(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item, index): ShootingScriptScene | null => {
      if (!item || typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const duration = readString(source.duration, 24);
      const shot = readString(source.shot, 180);
      const voiceover = readString(source.voiceover, 260);
      const caption = readString(source.caption, 60);
      if (!shot || !voiceover) return null;
      return {
        scene: typeof source.scene === "number" && Number.isFinite(source.scene)
          ? Math.max(1, Math.floor(source.scene))
          : index + 1,
        duration: duration || "",
        shot,
        voiceover,
        caption,
      };
    })
    .filter((item): item is ShootingScriptScene => Boolean(item))
    .slice(0, 8)
    .map((item, index) => ({ ...item, scene: index + 1 }));
}

function normalizeAiPayload(raw: unknown): NormalizedScriptPayload {
  if (!raw || typeof raw !== "object") {
    throw Errors.business(
      502,
      "AI 返回结构解析失败",
      "SOCIAL_VIDEO_SCRIPT_PARSE_FAILED",
    );
  }

  const source = raw as Record<string, unknown>;
  const rewrittenCopy = readString(source.rewritten_copy, 4000);
  const shootingScript = normalizeShootingScript(source.shooting_script);
  if (!rewrittenCopy || shootingScript.length < 3) {
    throw Errors.business(
      502,
      "AI 返回脚本结构不完整",
      "SOCIAL_VIDEO_SCRIPT_PARSE_FAILED",
      { shootingScriptCount: shootingScript.length },
    );
  }

  return {
    title: readString(source.title, 80) || "短视频拍摄脚本",
    hook: readString(source.hook, 200) || shootingScript[0]?.voiceover || "",
    rewritten_copy: rewrittenCopy,
    shooting_script: shootingScript,
    cover_text_options: readStringArray(source.cover_text_options, 4, 40),
    caption_options: readStringArray(source.caption_options, 4, 120),
    tips: readStringArray(source.tips, 6, 100),
  };
}

function getTodayStartIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function getSinceByHours(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() - Math.max(hours, 0));
  return date.toISOString();
}

function serializeScript(record: SocialVideoScriptRecord, cached = false) {
  return {
    id: record.id,
    transcription_id: record.transcription_id,
    status: record.status,
    target_platform: record.target_platform,
    style: record.style,
    duration_seconds: record.duration_seconds,
    goal: record.goal,
    title: record.title,
    rewritten_copy: record.rewritten_copy,
    hook: record.hook,
    shooting_script: Array.isArray(record.shooting_script) ? record.shooting_script : [],
    cover_text_options: Array.isArray(record.cover_text_options) ? record.cover_text_options : [],
    caption_options: Array.isArray(record.caption_options) ? record.caption_options : [],
    tips: Array.isArray(record.tips) ? record.tips : [],
    source_text_length: record.source_text_length,
    created_at: record.created_at,
    cached,
  };
}

function buildUserPrompt(input: {
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

async function callAi(input: {
  tenantId?: string | null;
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
      temperature: 0.45,
      messages,
      responseFormat: "json_object",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 生成拍摄脚本失败";
    if (!message.includes("response_format")) {
      throw error;
    }
    result = await aiGateway.chat({
      sceneCode: "social_video_script",
      tenantId: input.tenantId,
      temperature: 0.45,
      messages,
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

class SocialVideoScriptService {
  private canManage(authContext: AuthContext) {
    return authContext.roleCodes.includes("system_admin")
      || accessPolicyService.hasPermission(authContext, "social_video_transcription.manage");
  }

  private assertCanManage(authContext: AuthContext) {
    if (!this.canManage(authContext)) {
      throw Errors.forbidden();
    }
  }

  private assertCanUseTranscription(
    authContext: AuthContext,
    transcription: { created_by_auth_user_id: string | null; tenant_id?: string | null },
  ) {
    if (
      authContext.tenantId &&
      transcription.tenant_id &&
      transcription.tenant_id !== authContext.tenantId &&
      !authContext.isPlatformAdmin
    ) {
      throw Errors.business(
        403,
        "当前用户无权访问该转写任务",
        "SOCIAL_VIDEO_TRANSCRIPTION_FORBIDDEN",
      );
    }

    if (
      transcription.created_by_auth_user_id &&
      transcription.created_by_auth_user_id !== authContext.authUserId &&
      !this.canManage(authContext)
    ) {
      throw Errors.business(
        403,
        "当前用户无权访问该转写任务",
        "SOCIAL_VIDEO_TRANSCRIPTION_FORBIDDEN",
      );
    }
  }

  private getTenantIdForAdmin(authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    return tenantId || null;
  }

  private async assertDailyLimit(authUserId: string, tenantId: string | null) {
    const limit = await systemSettingsService.getNumber(
      "SOCIAL_VIDEO_SCRIPT_DAILY_LIMIT_PER_USER",
      20,
    );
    if (limit <= 0) return;

    const count = await socialVideoScriptRepository.countCreatedByUserSince({
      tenantId,
      userId: authUserId,
      since: getTodayStartIso(),
    });
    if (count >= limit) {
      throw Errors.business(
        429,
        "今日脚本生成次数已达上限，请明天再试",
        "SOCIAL_VIDEO_SCRIPT_DAILY_LIMIT_EXCEEDED",
      );
    }
  }

  private async findCached(input: {
    tenantId: string | null;
    transcriptionId: string;
    targetPlatform: SocialVideoScriptTargetPlatform;
    style: SocialVideoScriptStyle;
    durationSeconds: number;
    goal: SocialVideoScriptGoal;
  }) {
    const ttlHours = await systemSettingsService.getNumber(
      "SOCIAL_VIDEO_SCRIPT_CACHE_TTL_HOURS",
      24,
    );
    if (ttlHours <= 0) return null;

    return socialVideoScriptRepository.findRecentCompleted({
      ...input,
      since: getSinceByHours(ttlHours),
    });
  }

  private normalizeScriptInput(input: CreateSocialVideoScriptInput) {
    if (input.style === "douyin_practical") {
      return {
        targetPlatform: "douyin" as const,
        style: "practical" as const,
        durationSeconds: input.duration_seconds,
        goal: input.goal,
      };
    }

    if (input.style === "xiaohongshu") {
      return {
        targetPlatform: "xiaohongshu" as const,
        style: "seeding" as const,
        durationSeconds: input.duration_seconds,
        goal: input.goal,
      };
    }

    const targetPlatform = input.target_platform ?? "douyin";
    const style = input.style
      ?? (targetPlatform === "xiaohongshu" ? "seeding" : "practical");

    return {
      targetPlatform,
      style,
      durationSeconds: input.duration_seconds,
      goal: input.goal,
    };
  }

  async generateScript(
    transcriptionId: string,
    input: CreateSocialVideoScriptInput,
    authContext: AuthContext,
  ) {
    const transcription = await socialVideoTranscriptionRepository.findById(transcriptionId);
    if (!transcription) {
      throw Errors.business(
        404,
        "转写任务不存在",
        "SOCIAL_VIDEO_TRANSCRIPTION_NOT_FOUND",
      );
    }

    this.assertCanUseTranscription(authContext, transcription);
    if (transcription.status !== "completed") {
      throw Errors.business(
        400,
        "转写任务尚未完成",
        "SOCIAL_VIDEO_TRANSCRIPTION_NOT_COMPLETED",
      );
    }

    const text = typeof transcription.text === "string" ? transcription.text.trim() : "";
    if (!text) {
      throw Errors.business(
        400,
        "转写文本为空，无法生成拍摄脚本",
        "SOCIAL_VIDEO_TRANSCRIPTION_TEXT_EMPTY",
      );
    }

    const normalizedInput = this.normalizeScriptInput(input);
    if (!input.regenerate) {
      const cached = await this.findCached({
        tenantId: transcription.tenant_id,
        transcriptionId,
        targetPlatform: normalizedInput.targetPlatform,
        style: normalizedInput.style,
        durationSeconds: normalizedInput.durationSeconds,
        goal: normalizedInput.goal,
      });
      if (cached) {
        return serializeScript(cached, true);
      }
    }

    await this.assertDailyLimit(authContext.authUserId, transcription.tenant_id);

    const maxSourceChars = await systemSettingsService.getNumber(
      "SOCIAL_VIDEO_SCRIPT_SOURCE_MAX_CHARS",
      4000,
    );
    const aiResult = await callAi({
      tenantId: transcription.tenant_id,
      targetPlatform: normalizedInput.targetPlatform,
      style: normalizedInput.style,
      durationSeconds: normalizedInput.durationSeconds,
      goal: normalizedInput.goal,
      title: transcription.title,
      text: truncateByChars(text, Math.max(1000, Math.min(maxSourceChars, 8000))),
    });

    const record = await socialVideoScriptRepository.create({
      tenantId: transcription.tenant_id,
      transcriptionId,
      userId: authContext.authUserId,
      platform: transcription.platform,
      targetPlatform: normalizedInput.targetPlatform,
      style: normalizedInput.style,
      durationSeconds: normalizedInput.durationSeconds,
      goal: normalizedInput.goal,
      title: aiResult.payload.title,
      rewrittenCopy: aiResult.payload.rewritten_copy,
      hook: aiResult.payload.hook,
      shootingScript: aiResult.payload.shooting_script,
      coverTextOptions: aiResult.payload.cover_text_options,
      captionOptions: aiResult.payload.caption_options,
      tips: aiResult.payload.tips,
      sourceTextLength: Array.from(text).length,
      promptVersion: PROMPT_VERSION,
      modelProvider: aiResult.provider,
      modelName: aiResult.model,
      status: "completed",
      rawPayload: aiResult.rawPayload,
    });

    return serializeScript(record);
  }

  async listScripts(
    transcriptionId: string,
    query: ListSocialVideoScriptsQuery,
    authContext: AuthContext,
  ) {
    const transcription = await socialVideoTranscriptionRepository.findById(transcriptionId);
    if (!transcription) {
      throw Errors.business(
        404,
        "转写任务不存在",
        "SOCIAL_VIDEO_TRANSCRIPTION_NOT_FOUND",
      );
    }

    this.assertCanUseTranscription(authContext, transcription);

    const result = await socialVideoScriptRepository.listByTranscription({
      tenantId: transcription.tenant_id,
      transcriptionId,
      page: query.page,
      pageSize: query.pageSize,
      targetPlatform: query.target_platform,
      style: query.style,
      status: query.status,
    });

    return {
      items: result.items.map((item) => serializeScript(item)),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async listAdminScripts(
    query: ListSocialVideoScriptsQuery,
    authContext: AuthContext,
  ) {
    this.assertCanManage(authContext);
    const tenantId = this.getTenantIdForAdmin(authContext);

    const result = await socialVideoScriptRepository.listAll({
      tenantId,
      page: query.page,
      pageSize: query.pageSize,
      targetPlatform: query.target_platform,
      style: query.style,
      status: query.status,
    });

    return {
      items: result.items.map((item) => serializeScript(item)),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}

export const socialVideoScriptService = new SocialVideoScriptService();
