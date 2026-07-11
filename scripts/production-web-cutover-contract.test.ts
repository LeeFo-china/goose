import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const repoFile = (path: string) => new URL(`../${path}`, import.meta.url);
const readRepoFile = (path: string) => readFileSync(repoFile(path), "utf8");

describe("production official website cutover contracts", () => {
  test("keeps the legacy Admin partner surface until the observation gate closes", () => {
    expect(existsSync(repoFile("apps/admin/app/(site)/partners/page.tsx"))).toBe(true);
    expect(
      existsSync(
        repoFile("apps/admin/components/official-site/partner-application-form.tsx"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        repoFile("apps/admin/app/api/public/partner-applications/route.ts"),
      ),
    ).toBe(true);
    expect(
      existsSync(repoFile("apps/admin/app/(console)/platform/partners/page.tsx")),
    ).toBe(true);
  });

  test("proxies www to Web and redirects only the exact Admin partner path", () => {
    const nginx = readRepoFile("deploy/nginx/gooes-web.conf");

    expect(nginx).toContain("server_name www.goodcms.cn;");
    expect(nginx).toContain("proxy_pass http://127.0.0.1:3020;");
    expect(nginx).toContain("location /_next/static/");
    expect(nginx).toContain('Cache-Control "public, max-age=31536000, immutable"');
    expect(nginx).toContain("proxy_set_header Host $host;");
    expect(nginx).toContain("proxy_set_header X-Real-IP $remote_addr;");
    expect(nginx).toContain(
      "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    );
    expect(nginx).toContain("proxy_set_header X-Forwarded-Proto $scheme;");
    expect(nginx).toContain("server_name admin.goodcms.cn;");
    expect(nginx).toContain("location = /partners {");
    expect(nginx).toContain(
      "return 301 https://www.goodcms.cn/partners$is_args$args;",
    );
    expect(nginx).toContain("proxy_pass http://127.0.0.1:3010;");
    expect(nginx).not.toMatch(/location\s+\^?~?\s+\/partners\/?\s*\{/);
  });

  test("deploys Web behind loopback smoke without mutating production Nginx", () => {
    const buildWorkflow = readRepoFile(".github/workflows/build-docker-images.yml");
    const deployWorkflow = readRepoFile(".github/workflows/deploy-docker-services.yml");

    expect(buildWorkflow).toContain("web_smoke_content_path:");
    expect(buildWorkflow).toContain(
      "web_smoke_content_path: ${{ github.event.inputs.web_smoke_content_path }}",
    );
    expect(deployWorkflow).toContain("web_smoke_content_path:");
    expect(deployWorkflow).toContain("WEB_SMOKE_CONTENT_PATH");
    expect(deployWorkflow).toContain("http://127.0.0.1:3020/");
    expect(deployWorkflow).toContain('Host: www.goodcms.cn');
    expect(deployWorkflow).toContain('"http://127.0.0.1:3020${path}"');
    expect(deployWorkflow).toContain('smoke_url "/partners"');
    expect(deployWorkflow).toContain('smoke_url "/sitemap.xml"');
    expect(deployWorkflow).toContain('smoke_url "${WEB_SMOKE_CONTENT_PATH}"');
    expect(deployWorkflow).toContain("http://127.0.0.1:3020/api/preview");
    expect(deployWorkflow).not.toMatch(/(?:install|cp).*gooes-web\.conf/);
    expect(deployWorkflow).not.toMatch(/(?:systemctl\s+reload|nginx\s+-s)/);
  });

  test("verifies an automatic Web image rollback through loopback before cutover", () => {
    const deployWorkflow = readRepoFile(".github/workflows/deploy-docker-services.yml");
    const rollbackStart = deployWorkflow.indexOf("- name: Roll back production web");
    const rollbackEnd = deployWorkflow.indexOf(
      "- name: Clean up expired production web rollback tags",
    );
    const rollbackStep = deployWorkflow.slice(rollbackStart, rollbackEnd);

    expect(rollbackStart).toBeGreaterThanOrEqual(0);
    expect(rollbackEnd).toBeGreaterThan(rollbackStart);
    expect(rollbackStep).toContain("http://127.0.0.1:3020/partners");
    expect(rollbackStep).toContain('Host: www.goodcms.cn');
    expect(rollbackStep).not.toContain("https://www.goodcms.cn/partners");
  });

  test("documents a manual, reversible cutover with an observation gate", () => {
    const runbook = readRepoFile(
      "docs/operations/official-website-production-cutover-runbook.md",
    );

    for (const requiredText of [
      "Admin 镜像",
      "Web 镜像",
      "Nginx 配置 SHA-256",
      "DNS TTL",
      "Sitemap URL 数量",
      "/etc/nginx/sites-enabled/reverse-proxy",
      "nginx -t",
      "30 分钟",
      "P0",
      "P1",
      "不回滚 CMS",
      "至少一个完整发布周期",
      "apps/admin/app/(site)/partners/page.tsx",
    ]) {
      expect(runbook).toContain(requiredText);
    }
  });
});
