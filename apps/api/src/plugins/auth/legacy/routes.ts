import type { VerifiedJwtPayload } from "./types";

const publicRoutes = new Set([
  "/",
  "/auth",
  "/auth/send-code",
  "/admin/auth/send-code",
  "/admin/auth/login",
]);

export function isPublicRoute(method: string, url: string) {
  if (publicRoutes.has(url)) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && url === "/ai/decoration-qa/suggestions"
  ) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && url === "/public/administrative-areas"
  ) {
    return true;
  }

  if (method === "POST" && url === "/public/partner-applications") {
    return true;
  }

  if (isPartnerAuthRoute(method, url)) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD") &&
    url.startsWith("/partner-onboarding/invite-codes/")
  ) {
    return true;
  }

  if ((method === "GET" || method === "HEAD") && url.startsWith("/share-campaigns/")) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && url.startsWith("/share-campaign-claim-vouchers/")
  ) {
    return true;
  }

  if (method === "POST" && url === "/share-campaigns/open") {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && (url === "/public/marketing-pages" || url.startsWith("/public/marketing-pages/"))
  ) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && url.startsWith("/public/tenants/")
    && url.includes("/marketing-pages")
  ) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && url.startsWith("/public/tenant-share-links/")
  ) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && (
      url === "/visitor/picture-library/categories" ||
      url === "/visitor/picture-library/assets" ||
      url.startsWith("/visitor/picture-library/assets/")
    )
  ) {
    return true;
  }

  if (
    (method === "POST" || method === "DELETE")
    && url.startsWith("/visitor/picture-library/assets/")
    && (url.endsWith("/like") || url.endsWith("/favorite"))
  ) {
    return true;
  }

  if (
    method === "POST"
    && url.startsWith("/public/marketing-pages/")
    && (url.endsWith("/leads") || url.endsWith("/events"))
  ) {
    return true;
  }

  if (
    method === "POST"
    && url.startsWith("/public/tenants/")
    && url.includes("/marketing-pages/")
    && (url.endsWith("/leads") || url.endsWith("/events"))
  ) {
    return true;
  }

  if (
    method === "POST"
    && url === "/pay/wechat/callback"
  ) {
    return true;
  }

  if (
    method === "POST"
    && url === "/customer/project-acceptances/open-ticket/verify"
  ) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && url.startsWith("/customer/project-acceptances/")
  ) {
    return true;
  }

  if (
    method === "POST"
    && url.startsWith("/project-acceptances/")
    && (url.endsWith("/customer-confirm") || url.endsWith("/customer-dispute"))
  ) {
    return true;
  }

  return false;
}

export function isPartnerAuthRoute(method: string, url: string) {
  return (
    method === "POST" &&
    (
      url === "/partner/auth/login" ||
      url === "/partner/auth/send-code" ||
      url === "/partner/auth/bind-phone"
    )
  );
}

export function shouldBypassAuth(method: string, url: string) {
  return isPartnerAuthRoute(method, url);
}

export function isPartnerPortalRoute(method: string, url: string) {
  return (
    (method === "GET" || method === "HEAD") &&
    url === "/partner/auth/me"
  );
}

export function isVisitorSessionRoute(method: string, url: string) {
  if (
    (method === "GET" || method === "HEAD")
    && url === "/public/administrative-areas"
  ) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD") &&
    (url === "/visitor/location/options" || url === "/visitor/location-context")
  ) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && (
      url === "/visitor/picture-library/categories" ||
      url === "/visitor/picture-library/assets" ||
      url.startsWith("/visitor/picture-library/assets/")
    )
  ) {
    return true;
  }

  if (
    method === "POST" &&
    (
      url === "/visitor/location-bootstrap" ||
      url === "/visitor/location-bootstrap/confirm" ||
      url === "/visitor/location-bootstrap/skip"
    )
  ) {
    return true;
  }

  if (
    (method === "POST" || method === "DELETE")
    && url.startsWith("/visitor/picture-library/assets/")
    && (url.endsWith("/like") || url.endsWith("/favorite"))
  ) {
    return true;
  }

  if (
    method === "POST"
    && url.startsWith("/visitor/picture-library/assets/")
    && url.endsWith("/comments")
  ) {
    return true;
  }

  if (
    method === "POST"
    && url.startsWith("/visitor/picture-library/assets/")
    && url.endsWith("/share-events")
  ) {
    return true;
  }

  if (
    method === "POST"
    && (url === "/uploads/cos/direct-init" || url === "/uploads/cos/direct-complete")
  ) {
    return true;
  }

  if (method === "POST" && url === "/auth/verify-role") {
    return true;
  }

  if (method === "POST" && url === "/auth/wechat-rebind-requests") {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && (url === "/front/projects" || url.startsWith("/front/projects/"))
  ) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && (url === "/visitor/projects" || url === "/visitor/project-follows")
  ) {
    return true;
  }

  if (
    (method === "POST" || method === "DELETE")
    && url.startsWith("/visitor/projects/")
    && url.endsWith("/follow")
  ) {
    return true;
  }

  if (
    method === "GET"
    && url === "/ai/decoration-qa/suggestions"
  ) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && (url === "/visitor/location/options" || url === "/visitor/location-context")
  ) {
    return true;
  }

  if (
    method === "POST"
    && (
      url === "/visitor/location-bootstrap"
      || url === "/visitor/location-bootstrap/confirm"
      || url === "/visitor/location-bootstrap/skip"
    )
  ) {
    return true;
  }

  if (
    method === "POST"
    && (url === "/ai/decoration-qa" || url === "/ai/decoration-qa/stream")
  ) {
    return true;
  }

  return false;
}

export function isPureVisitorPayload(payload: VerifiedJwtPayload) {
  const roles = Array.isArray(payload.roles) ? payload.roles : [];
  return (
    roles.length === 1 &&
    roles[0] === "visitor" &&
    !payload.tenant_id &&
    !payload.customer_id &&
    !payload.employee_id
  );
}
