type AiResourcePrefix = "prv" | "mdl" | "scene";
type UuidFactory = () => string;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createAiResourceCode(
  prefix: AiResourcePrefix,
  uuidFactory: UuidFactory = () => crypto.randomUUID(),
): string {
  const generatedUuid = uuidFactory();
  if (typeof generatedUuid !== "string" || !UUID_PATTERN.test(generatedUuid)) {
    throw new TypeError("Invalid UUID returned by AI resource code factory");
  }

  return `${prefix}_${generatedUuid.toLowerCase().replaceAll("-", "")}`;
}
