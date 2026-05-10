import { notFound, redirect } from "next/navigation";
import { H5PageEditor, type H5PageConfig } from "@/components/marketing/h5-page-editor";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type RouteParams = {
  id: string;
};

type H5PageDraftData = {
  page: {
    id: string;
    title: string;
    slug: string;
    status: string;
  };
  draft_version: {
    id: string;
    config: H5PageConfig;
  };
};

const PLATFORM_H5_API_BASE_PATH = "/platform/marketing-pages";
const PLATFORM_H5_RETURN_HREF = "/platform/marketing-pages";

async function fetchDraft(token: string, id: string) {
  const response = await fetch(buildBackendUrl(`${PLATFORM_H5_API_BASE_PATH}/${id}/draft`), {
    headers: {
      authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const payload = await parseBackendJson<H5PageDraftData>(response);
  return payload.data;
}

export default async function PlatformH5PageEditorPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.roles.includes("platform_admin")) {
    notFound();
  }

  const token = await getAdminToken();
  if (!token) {
    notFound();
  }

  const { id } = await params;
  const data = await fetchDraft(token, id).catch(() => null);
  if (!data) {
    notFound();
  }

  return (
    <H5PageEditor
      page={data.page}
      draftVersion={data.draft_version}
      returnHref={PLATFORM_H5_RETURN_HREF}
      apiBasePath={PLATFORM_H5_API_BASE_PATH}
    />
  );
}
