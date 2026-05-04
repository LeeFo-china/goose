import { notFound } from "next/navigation";
import { H5PageEditor, type H5PageConfig } from "@/components/marketing/h5-page-editor";
import { getAdminToken } from "@/lib/auth";
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

async function fetchDraft(token: string, id: string) {
  const response = await fetch(buildBackendUrl(`/marketing-pages/${id}/draft`), {
    headers: {
      authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const payload = await parseBackendJson<H5PageDraftData>(response);
  return payload.data;
}

export default async function H5PageEditorPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
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
    />
  );
}
