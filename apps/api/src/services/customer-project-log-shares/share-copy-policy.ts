export const SHORT_SHARE_COPY_MAX_DISPLAY_CHARS = 48;

interface ShareCopy {
  id: string;
  text: string;
}

const SHORT_SHARE_COPY_FALLBACKS: readonly ShareCopy[] = [
  {
    id: "short_fallback_1",
    text: "记录家的新变化，施工进度稳稳向前，期待一点点变成理想的样子。",
  },
  {
    id: "short_fallback_2",
    text: "今天的施工现场又有新进展，细节逐步落定，心里也更踏实了。",
  },
  {
    id: "short_fallback_3",
    text: "装修是一场慢慢兑现的期待，看着家的轮廓越来越清晰，真好。",
  },
];

export function countDisplayCharacters(text: string): number {
  return Array.from(text).length;
}

export function getShareCopyLengthInstruction(
  length: "short" | "medium",
): string {
  return length === "short"
    ? "每条最多 48 个中文展示字符（包含标点），句意完整且不得以省略号结尾。"
    : "每条 1-2 句话，保持语义完整。";
}

export function isValidShortShareCopy(text: string): boolean {
  const normalized = text.trim();
  return normalized.length > 0
    && countDisplayCharacters(normalized) <= SHORT_SHARE_COPY_MAX_DISPLAY_CHARS
    && !/(?:\.\.\.|…+)$/.test(normalized);
}

function normalizeBasicCopies(copies: readonly ShareCopy[]): ShareCopy[] {
  return copies
    .map((copy) => ({ ...copy, text: copy.text.trim() }))
    .filter((copy) => copy.text.length > 0)
    .slice(0, 3);
}

export function normalizeShareCopies(
  copies: readonly ShareCopy[],
  length: "short" | "medium",
  mediumFallback: readonly ShareCopy[],
): ShareCopy[] {
  const normalized = normalizeBasicCopies(copies);
  if (length === "medium") {
    return normalized.length > 0
      ? normalized
      : normalizeBasicCopies(mediumFallback);
  }

  const result: ShareCopy[] = [];
  const seenTexts = new Set<string>();
  for (const copy of normalized) {
    if (!isValidShortShareCopy(copy.text) || seenTexts.has(copy.text)) {
      continue;
    }
    result.push(copy);
    seenTexts.add(copy.text);
  }

  for (const fallback of SHORT_SHARE_COPY_FALLBACKS) {
    if (result.length >= 3) {
      break;
    }
    if (!isValidShortShareCopy(fallback.text) || seenTexts.has(fallback.text)) {
      continue;
    }
    result.push({ ...fallback });
    seenTexts.add(fallback.text);
  }

  return result.slice(0, 3);
}
