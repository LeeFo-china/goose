import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const webRoot = new URL("../", import.meta.url);
const repositoryRoot = new URL("../../../", import.meta.url);

function read(root: URL, path: string): string {
  const file = new URL(path, root);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

describe("phase one SEO and standalone deployment", () => {
  test("publishes only phase one routes with explicit indexability metadata", () => {
    const layout = read(webRoot, "app/layout.tsx");
    const partners = read(webRoot, "app/(marketing)/partners/page.tsx");
    const sitemap = read(webRoot, "app/sitemap.ts");
    const robots = read(webRoot, "app/robots.ts");

    expect(layout).toContain("metadataBase");
    expect(layout).toContain("template:");
    expect(layout).toContain("canonical:");
    expect(partners).toContain("canonical:");
    expect(sitemap.match(/new URL\(/g)).toHaveLength(2);
    expect(sitemap).toContain('new URL("/"');
    expect(sitemap).toContain('new URL("/partners"');
    expect(robots).toContain('disallow: ["/api/", "/portal/"]');
  });

  test("provides a navigable Chinese not-found page", () => {
    const notFound = read(webRoot, "app/not-found.tsx");
    expect(notFound).toContain("页面未找到");
    expect(notFound).toContain('href="/"');
    expect(notFound).toContain('href="/partners"');
    expect(notFound).toContain("Button");
  });

  test("verifies copied standalone CSS and public assets", () => {
    const packageJson = read(webRoot, "package.json");
    const rootPackageJson = read(repositoryRoot, "package.json");
    const verifier = read(webRoot, "scripts/verify-standalone-css.mjs");
    expect(packageJson).toContain('"verify:standalone-css"');
    expect(rootPackageJson).toContain('"web:verify:standalone-css"');
    expect(verifier).toContain("standalone");
    expect(verifier).toContain(".css");
    expect(verifier).toContain("public");
    expect(verifier).toContain("statSync");
    expect(verifier).toContain("process.exitCode = 1");
  });

  test("defines web images and production and dev compose services", () => {
    const dockerfile = read(repositoryRoot, "docker/web.Dockerfile");
    const production = read(repositoryRoot, "deploy/docker-compose.web.yml");
    const development = read(repositoryRoot, "deploy/docker-compose.dev.yml");
    expect(dockerfile).toContain("--filter @gooes/web");
    expect(dockerfile).toContain('com.goodcms.service="web"');
    expect(dockerfile).toContain('CMD ["node", "apps/web/server.js"]');
    expect(production).toContain("gooes-web:");
    expect(production).toContain("/partners");
    expect(development).toContain("gooes-web-dev:");
    expect(development).toContain("http://gooes-api-dev:3000");
    expect(development).toContain("127.0.0.1:13020:3020");
  });

  test("routes the dev domain with forwarded headers and immutable assets", () => {
    const nginx = read(repositoryRoot, "deploy/nginx/gooes-web-dev.conf");
    expect(nginx).toContain("server_name www-dev.goodcms.cn");
    expect(nginx).toContain("proxy_pass http://127.0.0.1:13020");
    for (const header of ["Host", "X-Real-IP", "X-Forwarded-For", "X-Forwarded-Proto"]) {
      expect(nginx).toContain(`proxy_set_header ${header}`);
    }
    expect(nginx).toContain("/_next/static/");
    expect(nginx).toContain("immutable");
  });

  test("includes web in all three deployment workflows without weakening migration gates", () => {
    const dev = read(repositoryRoot, ".github/workflows/deploy-dev.yml");
    const build = read(repositoryRoot, ".github/workflows/build-docker-images.yml");
    const deploy = read(repositoryRoot, ".github/workflows/deploy-docker-services.yml");
    const gate = read(repositoryRoot, ".github/workflows/verify-web-deployment-gate.yml");
    const workflows = `${dev}\n${build}\n${deploy}`;
    expect(dev).toContain('"apps/web/**"');
    expect(dev).toContain('"docker/web.Dockerfile"');
    expect(dev).toContain("https://www-dev.goodcms.cn/partners");
    expect(build).toContain("service: web");
    expect(build).toContain("docker/web.Dockerfile");
    expect(deploy).toContain("gooes-web");
    expect(deploy).toContain("https://www.goodcms.cn/partners");
    expect(workflows).toContain("Unknown service");
    expect(dev).toContain("gate_run_id");
    expect(build).toContain("gate_run_id");
    expect(deploy).toContain("gate_run_id");
    expect(gate).toContain("migration_version");
  });
});
