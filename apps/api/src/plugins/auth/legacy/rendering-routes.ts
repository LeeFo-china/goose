const renderingStyleIdSegment = /^[^/?#]+$/;

export function isRenderingStylesReadRoute(
  method: string,
  url: string,
  scope: "visitor" | "douyin-mini",
) {
  if (method !== "GET" && method !== "HEAD") return false;
  const collection = `/${scope}/renderings/styles`;
  if (url === collection) return true;
  if (!url.startsWith(`${collection}/`)) return false;
  return renderingStyleIdSegment.test(url.slice(collection.length + 1));
}
