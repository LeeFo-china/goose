import type { PublicProject } from "../../models";

export function toPublicSitePresentation(site: PublicProject): PublicProject {
  const community = site.community.trim();
  return {
    ...site,
    title: community || "公开在建工地",
    community,
    status: site.status === "started" ? "已开工" : "施工中",
    updated_at: site.updated_at.slice(0, 10),
  };
}
