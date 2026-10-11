const RESERVED_PATH = /(?:^|\/)private\/project-log-project-comments(?:\/|$)/;

/** Recognize only the reserved comment namespace, including malformed URL aliases.
 * Do not rely on URL/decodeURIComponent succeeding: the public resolver preserves
 * unparseable input. Decode ASCII escapes even alongside invalid UTF-8 or % escapes.
 */
export function isProjectCommentPrivateFileReference(value: string): boolean {
  let path = value.trim().split(/[?#]/, 1)[0] ?? "";
  while (true) {
    const decoded = path.replace(/%(?:25)*([\da-f]{2})/gi, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    );
    if (decoded === path) break;
    path = decoded;
  }
  path = path.replace(/[\t\r\n]/g, "").replace(/\\/g, "/");
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return RESERVED_PATH.test(segments.join("/"));
}

/** Match the array and JSON-string array representations accepted by legacy logs. */
export function hasProjectCommentPrivateFileReference(images: unknown): boolean {
  let values = images;
  if (typeof values === "string") {
    if (isProjectCommentPrivateFileReference(values)) return true;
    try { values = JSON.parse(values) as unknown; } catch { return false; }
  }
  const references = Array.isArray(values) ? values : [values];
  return references.some(value => typeof value === "string" && isProjectCommentPrivateFileReference(value));
}
