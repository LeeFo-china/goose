import type { DouyinQaAnswer, LaunchContext } from "../models";
import { ApiClient, ApiRequestError } from "./request";

const MAX_TEXT_LENGTH = 120;

export type DouyinQaRequest = {
  question: string;
  attribution: LaunchContext;
};

export async function askDecorationQuestion(
  client: ApiClient,
  input: DouyinQaRequest,
): Promise<DouyinQaAnswer> {
  const value = await client.request<unknown>({
    path: "/douyin-mini/qa",
    method: "POST",
    data: input,
    timeoutMs: 30_000,
  });
  const parsed = parseDouyinQaAnswer(value);
  if (!parsed) {
    throw new ApiRequestError(502, "INVALID_API_RESPONSE", "服务返回数据无效");
  }
  return parsed;
}

function parseDouyinQaAnswer(value: unknown): DouyinQaAnswer | null {
  if (!isStrictRecord(value, ["answer_points", "suggested_questions", "disclaimer"])) {
    return null;
  }
  const answerPoints = parseTextList(value.answer_points, 1, 3);
  const suggestedQuestions = parseTextList(value.suggested_questions, 1, 3);
  const disclaimer = boundedText(value.disclaimer, 1, MAX_TEXT_LENGTH);
  if (!answerPoints || !suggestedQuestions || !disclaimer
    || new Set(suggestedQuestions).size !== suggestedQuestions.length) {
    return null;
  }
  return {
    answer_points: answerPoints,
    suggested_questions: suggestedQuestions,
    disclaimer,
  };
}

function parseTextList(value: unknown, min: number, max: number): string[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max) return null;
  const result: string[] = [];
  for (const item of value) {
    const text = boundedText(item, 1, MAX_TEXT_LENGTH);
    if (!text) return null;
    result.push(text);
  }
  return result;
}

function boundedText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= min && normalized.length <= max
    ? normalized
    : null;
}

function isStrictRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}
