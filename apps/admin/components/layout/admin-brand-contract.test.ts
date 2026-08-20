import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const adminRoot = new URL("../../", import.meta.url);
const repoRoot = new URL("../../../../", import.meta.url);
const repoPath = fileURLToPath(repoRoot);

function readAdminSource(path: string) {
  return readFileSync(new URL(path, adminRoot), "utf8");
}

function readRepoSource(path: string) {
  return readFileSync(new URL(path, repoRoot), "utf8");
}

function runGit(args: string[]) {
  const result = spawnSync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} 执行失败`);
  }
  return result.stdout.split("\n").map((path) => path.trim()).filter(Boolean);
}

function isH5OrDouyinPath(path: string) {
  return path.startsWith("apps/h5/")
    || path.startsWith("apps/douyin-mini/")
    || (
      path.startsWith("apps/admin/")
      && /(?:^|[/_.-])(?:h5|douyin)(?=$|[/_.-])/i.test(path)
    );
}

function collectH5AndDouyinBoundaryPaths({
  originPaths,
  trackedPaths,
  untrackedPaths,
}: {
  originPaths: string[];
  trackedPaths: string[];
  untrackedPaths: string[];
}) {
  return [...new Set([...originPaths, ...trackedPaths, ...untrackedPaths])]
    .filter(isH5OrDouyinPath);
}

function readH5AndDouyinBoundaryDiff() {
  const originPaths = runGit([
    "ls-tree",
    "-r",
    "--name-only",
    "origin/main",
    "--",
    "apps/h5",
    "apps/douyin-mini",
    "apps/admin",
  ]).filter(isH5OrDouyinPath);
  const trackedPaths = runGit(["ls-files", "apps/h5", "apps/douyin-mini", "apps/admin"])
    .filter(isH5OrDouyinPath);
  const untrackedPaths = runGit([
    "ls-files",
    "--others",
    "--exclude-standard",
    "apps/h5",
    "apps/douyin-mini",
    "apps/admin",
  ]).filter(isH5OrDouyinPath);
  const protectedPaths = collectH5AndDouyinBoundaryPaths({
    originPaths,
    trackedPaths,
    untrackedPaths,
  });
  const changedPaths = runGit(["diff", "--name-only", "origin/main", "--", ...protectedPaths]);

  return {
    protectedPaths,
    changedPaths: [...new Set([...changedPaths, ...untrackedPaths])],
  };
}

function readAdminRenderSources(directory = adminRoot): Array<{ path: string; source: string }> {
  const excludedDirectories = new Set([
    ".next",
    "coverage",
    "e2e",
    "node_modules",
    "playwright-report",
    "test-results",
    "tests",
  ]);

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return excludedDirectories.has(entry.name)
        ? []
        : readAdminRenderSources(new URL(`${entry.name}/`, directory));
    }
    if (!entry.name.endsWith(".css") && !entry.name.endsWith(".tsx")) return [];
    if (/\.(?:test|spec)\.tsx$/.test(entry.name)) return [];

    const url = new URL(entry.name, directory);
    return [{
      path: decodeURIComponent(url.pathname.replace(adminRoot.pathname, "")),
      source: readFileSync(url, "utf8"),
    }];
  });
}

function readCssVariable(source: string, variable: string) {
  const match = source.match(new RegExp(`${variable}:\\s*([^;]+);`));
  if (!match?.[1]) throw new Error(`缺少 CSS 变量 ${variable}`);
  return match[1].trim();
}

function hslToRgb(value: string) {
  const [hue, saturationPercent, lightnessPercent] = value
    .split(/\s+/)
    .map((part) => Number(part.replace("%", "")));
  const saturation = saturationPercent / 100;
  const lightness = lightnessPercent / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = ((hue % 360) + 360) % 360 / 60;
  const secondary = chroma * (1 - Math.abs(segment % 2 - 1));
  const match = lightness - chroma / 2;
  const channels = segment < 1
    ? [chroma, secondary, 0]
    : segment < 2
      ? [secondary, chroma, 0]
      : segment < 3
        ? [0, chroma, secondary]
        : segment < 4
          ? [0, secondary, chroma]
          : segment < 5
            ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  return channels.map((channel) => channel + match);
}

function relativeLuminance(rgb: number[]) {
  const [red, green, blue] = rgb.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const luminances = [foreground, background]
    .map(hslToRgb)
    .map(relativeLuminance)
    .sort((left, right) => right - left);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

function readNamedE2eTest(source: string, name: string) {
  const start = source.indexOf(`test("${name}"`);
  if (start < 0) return "";
  const nextTest = source.indexOf('\n  test("', start + 1);
  return source.slice(start, nextTest < 0 ? source.length : nextTest);
}

describe("Admin 好店智装云品牌合同", () => {
  const legacyBrand = ["鹅", "班", "长"].join("");
  const sources = {
    layout: readAdminSource("app/layout.tsx"),
    loginPage: readAdminSource("app/login/page.tsx"),
    loginForm: readAdminSource("components/login-form.tsx"),
    adminShell: readAdminSource("components/layout/admin-shell.tsx"),
    adminSmoke: readAdminSource("e2e/admin-smoke.spec.ts"),
    themeStore: readAdminSource("components/layout/admin-shell-preferences-store.ts"),
    globals: readAdminSource("app/globals.css"),
  };

  test("活动品牌界面统一使用好店智装云", () => {
    for (const source of [sources.layout, sources.loginPage, sources.adminShell]) {
      expect(source).toContain("好店智装云");
    }
    expect(Object.values(sources).join("\n")).not.toContain(legacyBrand);
  });

  test("Admin 渲染样式不包含渐变", () => {
    const renderSources = readAdminRenderSources();
    const violations = renderSources
      .filter(({ source }) => /(?:linear|radial|conic)-gradient|bg-gradient-/.test(source))
      .map(({ path }) => path);

    expect(renderSources.length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  test("橙色强调面使用满足 WCAG AA 的深色品牌前景", () => {
    const accent = readCssVariable(sources.globals, "--accent");
    const accentForeground = readCssVariable(sources.globals, "--accent-foreground");

    expect(contrastRatio(accentForeground, accent)).toBeGreaterThanOrEqual(4.5);
    expect(sources.themeStore).toContain('"--accent-foreground": "204 70% 16%"');
  });

  test("八套主题定义相同且完整的核心色彩令牌", () => {
    const themeBlock = sources.themeStore.slice(
      sources.themeStore.indexOf("const themeTokens"),
      sources.themeStore.indexOf("\n};", sources.themeStore.indexOf("const themeTokens")),
    );
    const themeMaps = [...themeBlock.matchAll(/^  (\w+): \{\n([\s\S]*?)^  \},/gm)];
    const tokenSets = themeMaps.map(([, , body]) =>
      new Set([...body.matchAll(/"(--[^"]+)":/g)].map((match) => match[1])),
    );

    expect(themeMaps).toHaveLength(8);
    expect(themeBlock.match(/"--foreground":/g)).toHaveLength(8);
    expect(tokenSets.every((tokens) => tokens.size === 19)).toBe(true);
    expect(tokenSets.every((tokens) =>
      [...tokenSets[0]].every((token) => tokens.has(token))
    )).toBe(true);
  });

  test("品牌 E2E 独立于组织架构服务流程", () => {
    const brandTest = readNamedE2eTest(
      sources.adminSmoke,
      "租户管理员看到好店智装云工作台",
    );
    const organizationTest = readNamedE2eTest(
      sources.adminSmoke,
      "租户管理员可访问组织架构并打开配置岗位弹窗",
    );

    expect(brandTest).toContain('gotoAdminPage(page, "/dashboard")');
    expect(brandTest).toContain('page.getByText("好店智装云工作台")');
    expect(organizationTest).not.toContain("好店智装云工作台");
  });

  test("登录页和管理壳使用带尺寸提示的 Next Image 品牌资源", () => {
    for (const source of [sources.loginPage, sources.adminShell]) {
      expect(source).toContain('import Image from "next/image"');
      expect(source).not.toMatch(/<img\b/);
      expect(source).toContain("width={");
      expect(source).toContain("height={");
      expect(source).toContain("sizes=");
    }
  });

  test("H5 和抖音小程序保留各自渐变", () => {
    expect(readRepoSource("apps/h5/src/styles.css")).toContain("linear-gradient");
    expect(readRepoSource("apps/douyin-mini/src/components/hero-banner/index.ttss")).toContain(
      "linear-gradient",
    );
  });

  test("H5 和抖音相关源文件相对 origin/main 保持零差异", () => {
    const { protectedPaths, changedPaths } = readH5AndDouyinBoundaryDiff();

    expect(protectedPaths).toContain(
      "apps/admin/components/marketing/h5-page-editor-image-upload-field.tsx",
    );
    expect(protectedPaths.some((path) => path.startsWith("apps/h5/"))).toBe(true);
    expect(protectedPaths.some((path) => path.startsWith("apps/douyin-mini/"))).toBe(true);
    expect(protectedPaths.some((path) => path.includes("/douyin-miniapp/"))).toBe(true);
    expect(changedPaths).toEqual([]);
  });

  test("origin/main 中删除或改名前的 H5 和抖音路径仍受边界保护", () => {
    const deletedOriginPath = "apps/admin/components/marketing/h5-legacy-editor.tsx";
    const renamedCurrentPath = "apps/admin/components/marketing/h5-current-editor.tsx";
    const protectedPaths = collectH5AndDouyinBoundaryPaths({
      originPaths: [deletedOriginPath],
      trackedPaths: [renamedCurrentPath],
      untrackedPaths: [],
    });

    expect(protectedPaths).toContain(deletedOriginPath);
    expect(protectedPaths).toContain(renamedCurrentPath);
  });
});
