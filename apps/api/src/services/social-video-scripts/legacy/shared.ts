import { Errors } from "@/errors/error-factory";
import { aiGateway } from "@/services/ai-gateway";
import { aiCallLogRepository } from "@/repositories/ai-call-logs";
import {
  socialVideoScriptRepository,
  type SocialVideoScriptRecord,
} from "@/repositories/social-video-scripts";
import { socialVideoTranscriptionRepository } from "@/repositories/social-video-transcriptions";
import type {
  CreateSocialVideoScriptInput,
  ListSocialVideoScriptsQuery,
  SocialVideoUsageSummaryQuery,
  SocialVideoScriptGoal,
  SocialVideoScriptStyle,
  SocialVideoScriptTargetPlatform,
} from "@/schema/social-video";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { systemSettingsService } from "@/services/system-settings";

export type AiMessageRole = "system" | "user" | "assistant";

export type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

export type OpenAiRequestBody = {
  model: string;
  temperature: number;
  messages: Array<{ role: AiMessageRole; content: string }>;
  response_format?: { type: "json_object" };
};

export type ShootingScriptScene = {
  scene: number;
  duration: string;
  shot: string;
  voiceover: string;
  caption: string;
};

export type NormalizedScriptPayload = {
  title: string;
  hook: string;
  rewritten_copy: string;
  shooting_script: ShootingScriptScene[];
  cover_text_options: string[];
  caption_options: string[];
  tips: string[];
};

export const PROMPT_VERSION = "social-video-script-v2";

export const STYLE_LABELS: Record<SocialVideoScriptStyle, string> = {
  practical: "实用口播",
  seeding: "种草分享",
  professional: "专业可信",
  down_to_earth: "接地气",
  douyin_practical: "抖音实用口播",
  xiaohongshu: "小红书种草",
};

export const TARGET_PLATFORM_LABELS: Record<SocialVideoScriptTargetPlatform, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  shipinhao: "视频号",
  kuaishou: "快手",
};

export const TARGET_PLATFORM_PROMPTS: Record<SocialVideoScriptTargetPlatform, string> = {
  douyin: "抖音内容更重开头 3 秒、强痛点、口播节奏和明确互动引导。",
  xiaohongshu: "小红书内容更重真实体验、生活化表达、封面标题和轻种草，不要像硬广。",
  shipinhao: "视频号内容更重可信度、专业感和稳重表达，适合业主和熟人社交传播。",
  kuaishou: "快手内容更重直接、真实、接地气和强互动，表达要口语化。",
};

export const GOAL_LABELS: Record<SocialVideoScriptGoal, string> = {
  lead_generation: "引流咨询",
  education: "装修科普",
  case_seeding: "案例种草",
  brand_trust: "品牌信任",
};

export const SYSTEM_PROMPT = [
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

export {
  Errors,
  accessPolicyService,
  aiCallLogRepository,
  aiGateway,
  socialVideoScriptRepository,
  socialVideoTranscriptionRepository,
  systemSettingsService,
};
export type {
  AuthContext,
  CreateSocialVideoScriptInput,
  ListSocialVideoScriptsQuery,
  SocialVideoScriptGoal,
  SocialVideoScriptStyle,
  SocialVideoScriptTargetPlatform,
  SocialVideoUsageSummaryQuery,
  SocialVideoScriptRecord,
};
