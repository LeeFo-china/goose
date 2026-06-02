import { Errors } from "./shared";
import type { NormalizedScriptPayload, OpenAiChatResponse, ShootingScriptScene, SocialVideoScriptRecord } from "./shared";

export function extractContent(content: OpenAiChatResponse["choices"]) {
  const rawContent = content?.[0]?.message?.content;
  if (typeof rawContent === "string") return rawContent;
  if (Array.isArray(rawContent)) {
    return rawContent.map((item) => item.text || "").join("").trim();
  }
  return "";
}

export function parseJsonObject(content: string) {
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

export function truncateByChars(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join("");
}

export function readString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return truncateByChars(value.trim(), maxLength);
}

export function readStringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function normalizeShootingScript(input: unknown) {
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

export function normalizeAiPayload(raw: unknown): NormalizedScriptPayload {
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

export function getTodayStartIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export function getSinceByHours(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() - Math.max(hours, 0));
  return date.toISOString();
}

export function serializeScript(record: SocialVideoScriptRecord, cached = false) {
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
