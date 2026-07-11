import type { Metadata } from "next";
import { cookies } from "next/headers";

import { PREVIEW_SESSION_COOKIE_NAME } from "./preview-session";
import { getPreviewSiteContentForPath } from "./site-content-api";

export const PREVIEW_ROBOTS_METADATA = {
  index: false,
  follow: false,
} as const;

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface PreviewCookieStore {
  get(name: string): { readonly value: string } | undefined;
}

interface ServerPreviewOptions {
  readonly cookieStore?: PreviewCookieStore;
  readonly sessionSecret?: string;
  readonly previewSecret?: string;
  readonly fetcher?: Fetcher;
  readonly nowMs?: number;
}

export async function getPreviewSiteContentForServerPath(
  path: string,
  options: ServerPreviewOptions = {},
) {
  const cookieStore = options.cookieStore ?? await cookies();
  const sessionValue = cookieStore.get(PREVIEW_SESSION_COOKIE_NAME)?.value;
  if (!sessionValue) return null;

  return getPreviewSiteContentForPath(path, {
    sessionValue,
    sessionSecret: options.sessionSecret
      ?? process.env.GOOES_PREVIEW_SESSION_SECRET?.trim()
      ?? "",
    previewSecret: options.previewSecret
      ?? process.env.GOOES_PREVIEW_SHARED_SECRET?.trim()
      ?? "",
    fetcher: options.fetcher,
    nowMs: options.nowMs,
  });
}

export function withPreviewRobots(
  metadata: Metadata,
  content: { readonly preview?: boolean } | null,
): Metadata {
  return content?.preview === true
    ? { ...metadata, robots: PREVIEW_ROBOTS_METADATA }
    : metadata;
}
