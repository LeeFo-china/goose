const GB28181_CODE_PATTERN = /^\d{20}$/;
const VIDEO_CHANNEL_TYPE_CODE = "131";
const TYPE_CODE_START_INDEX = 10;
const TYPE_CODE_END_INDEX = 13;

export function buildGb28181VideoChannelCode(
  deviceCode: string | null | undefined,
): string | null {
  const normalizedCode = deviceCode?.trim();
  if (!normalizedCode || !GB28181_CODE_PATTERN.test(normalizedCode)) {
    return null;
  }

  return [
    normalizedCode.slice(0, TYPE_CODE_START_INDEX),
    VIDEO_CHANNEL_TYPE_CODE,
    normalizedCode.slice(TYPE_CODE_END_INDEX),
  ].join("");
}
