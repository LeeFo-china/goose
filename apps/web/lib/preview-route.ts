import { consumeSitePreviewToken } from "./site-content-api";
import {
  buildExpiredPreviewSessionCookie,
  buildPreviewSessionCookie,
  createPreviewSession,
  getPreviewSessionSecret,
} from "./preview-session";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface PreviewHandlerDependencies {
  readonly fetcher?: Fetcher;
  readonly previewSecret?: string;
  readonly sessionSecret?: string;
  readonly nowMs?: number;
}

export function createPreviewHandler(dependencies: PreviewHandlerDependencies = {}) {
  return async function handlePreview(request: Request): Promise<Response> {
    const requestUrl = new URL(request.url);
    const errorPath = "/preview-error";
    const token = requestUrl.searchParams.get("token")?.trim();
    if (!token || token.length < 32 || token.length > 512) {
      return redirectWithoutToken(errorPath, true);
    }

    try {
      const previewSecret = dependencies.previewSecret
        ?? process.env.GOOES_PREVIEW_SHARED_SECRET?.trim()
        ?? "";
      const sessionSecret = dependencies.sessionSecret ?? getPreviewSessionSecret();
      const consumed = await consumeSitePreviewToken({
        token,
        secret: previewSecret,
        fetcher: dependencies.fetcher,
        nowMs: dependencies.nowMs,
      });
      const session = createPreviewSession({
        entryId: consumed.entryId,
        versionId: consumed.versionId,
        path: consumed.path,
        secret: sessionSecret,
        nowMs: dependencies.nowMs,
      });
      const response = redirectWithoutToken(consumed.path);
      response.headers.set("set-cookie", buildPreviewSessionCookie(session));
      return response;
    } catch {
      return redirectWithoutToken(errorPath, true);
    }
  };
}

function redirectWithoutToken(destination: string, clearPreviewSession = false): Response {
  const response = new Response(null, {
    status: 303,
    headers: {
      location: destination,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
    },
  });
  if (clearPreviewSession) {
    response.headers.set("set-cookie", buildExpiredPreviewSessionCookie());
  }
  return response;
}
