const DEFAULT_PRIMARY_COLOR = "#C45A32";
const DARK_TEXT_COLOR = "#000000";
const LIGHT_TEXT_COLOR = "#FFFFFF";

export type ResolvedThemeColor = {
  primaryColor: string;
  primaryTextColor: typeof DARK_TEXT_COLOR | typeof LIGHT_TEXT_COLOR;
  contrastRatio: number;
};

export function resolveThemeColor(value: unknown): ResolvedThemeColor {
  const primaryColor = typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : DEFAULT_PRIMARY_COLOR;
  const blackContrast = contrastRatio(primaryColor, DARK_TEXT_COLOR);
  const whiteContrast = contrastRatio(primaryColor, LIGHT_TEXT_COLOR);
  return whiteContrast >= blackContrast
    ? { primaryColor, primaryTextColor: LIGHT_TEXT_COLOR, contrastRatio: whiteContrast }
    : { primaryColor, primaryTextColor: DARK_TEXT_COLOR, contrastRatio: blackContrast };
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string): number {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
