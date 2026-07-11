import type { MetadataRoute } from "next";

const SITE_URL = "https://www.goodcms.cn";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: new URL("/", SITE_URL).toString() },
    { url: new URL("/partners", SITE_URL).toString() },
  ];
}
