import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const buildRevision = process.env.GOOES_BUILD_SHA ?? "unknown";

const nextConfig: NextConfig = {
  // SEO 稳定性优先：等待动态 metadata 后再输出 HTML，避免普通 Chrome/Lighthouse 把标签放进 body。
  htmlLimitedBots: /.*/,
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: join(appDir, "../.."),
  async headers() {
    return [
      {
        source: "/preview-error",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Gooes-Service", value: "web" },
          { key: "X-Gooes-Revision", value: buildRevision },
        ],
      },
    ];
  },
};

export default nextConfig;
