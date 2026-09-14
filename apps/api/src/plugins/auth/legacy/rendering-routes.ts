const renderingStyleIdSegment = /^[^/?#]+$/;

export function isRenderingJobsCreateRoute(method: string, url: string, scope: 'visitor' | 'douyin-mini') {
  return method === 'POST' && url === `/${scope}/renderings/jobs`;
}

export function isRenderingJobsReadRoute(method: string, url: string, scope: 'visitor' | 'douyin-mini') {
  if (method !== 'GET' && method !== 'HEAD') return false;
  const collection = `/${scope}/renderings/jobs`;
  return url.startsWith(`${collection}/`)
    && renderingStyleIdSegment.test(url.slice(collection.length + 1));
}

export function isRenderingUploadsRoute(method: string, url: string, scope: "visitor" | "douyin-mini") {
  const collection = `/${scope}/renderings/uploads`;
  if (method === 'GET' || method === 'HEAD') {
    return url.startsWith(`${collection}/`)
      && renderingStyleIdSegment.test(url.slice(collection.length + 1));
  }
  if (method !== "POST") return false;
  if (url === `${collection}:intent`) return true;
  if (!url.startsWith(`${collection}/`) || !url.endsWith("/complete")) return false;
  // The controller validates UUIDs so malformed IDs receive 400, not an auth failure.
  return renderingStyleIdSegment.test(url.slice(collection.length + 1, -"/complete".length));
}

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
