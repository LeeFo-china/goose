const SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:[.][0-9A-Za-z-]+)*))?(?:[+][0-9A-Za-z-]+(?:[.][0-9A-Za-z-]+)*)?$/;

export function compareDouyinTemplateVersion(
  left: string,
  right: string,
): number | null {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) return null;
  for (const key of ["major", "minor", "patch"] as const) {
    const diff = leftParts[key] - rightParts[key];
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return comparePrerelease(leftParts.prerelease, rightParts.prerelease);
}

type ParsedVersion = {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
};

function parseVersion(value: string): ParsedVersion | null {
  const matched = SEMVER_PATTERN.exec(value);
  if (!matched) return null;
  return {
    major: Number(matched[1]),
    minor: Number(matched[2]),
    patch: Number(matched[3]),
    prerelease: matched[4]?.split(".") ?? [],
  };
}

function comparePrerelease(
  left: readonly string[],
  right: readonly string[],
): number {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const compared = comparePrereleasePart(leftPart, rightPart);
    if (compared !== 0) return compared;
  }
  return 0;
}

function comparePrereleasePart(left: string, right: string): number {
  const leftNumber = numericIdentifier(left);
  const rightNumber = numericIdentifier(right);
  if (leftNumber !== null && rightNumber !== null) {
    const diff = leftNumber - rightNumber;
    return diff === 0 ? 0 : diff > 0 ? 1 : -1;
  }
  if (leftNumber !== null) return -1;
  if (rightNumber !== null) return 1;
  return left === right ? 0 : left > right ? 1 : -1;
}

function numericIdentifier(value: string): number | null {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  return Number(value);
}
