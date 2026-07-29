export function isTenantOnboardingOcrRoute(method: string, url: string) {
  if (
    (method === "GET" || method === "HEAD") &&
    url === "/tenant-onboarding/ocr/capabilities"
  ) {
    return true;
  }
  if (
    method === "POST" &&
    url === "/tenant-onboarding/ocr/recognitions"
  ) {
    return true;
  }
  return (
    (method === "GET" || method === "HEAD") &&
    /^\/tenant-onboarding\/ocr\/recognitions\/[^/]+$/.test(url)
  );
}
