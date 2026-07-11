import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const root = new URL("../", import.meta.url);

function read(path: string): string {
  const file = new URL(path, root);

  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

const requiredUiFiles = [
  "components/ui/alert.tsx",
  "components/ui/button.tsx",
  "components/ui/checkbox.tsx",
  "components/ui/dialog.tsx",
  "components/ui/field.tsx",
  "components/ui/input.tsx",
  "components/ui/select.tsx",
  "components/ui/separator.tsx",
  "components/ui/skeleton.tsx",
  "components/ui/textarea.tsx",
] as const;

const requiredTokens = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "border",
  "input",
  "ring",
] as const;

interface Oklch {
  readonly chroma: number;
  readonly hue: number;
  readonly lightness: number;
}

function getToken(cssBlock: string, token: string): Oklch {
  const match = cssBlock.match(
    new RegExp(`--${token}:\\s*([01](?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+)`),
  );

  expect(match).not.toBeNull();

  return {
    lightness: Number(match?.[1]),
    chroma: Number(match?.[2]),
    hue: Number(match?.[3]),
  };
}

function relativeLuminance({ lightness, chroma, hue }: Oklch): number {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return (
    0.2126 * Math.min(1, Math.max(0, red)) +
    0.7152 * Math.min(1, Math.max(0, green)) +
    0.0722 * Math.min(1, Math.max(0, blue))
  );
}

function contrastRatio(first: Oklch, second: Oklch): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);

  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

describe("official website design system contract", () => {
  test("defines dual-theme OKLCH semantic tokens and the Gooes font stack", () => {
    const css = read("app/globals.css");

    expect(css).toContain(":root");
    expect(css).toMatch(/\.dark\s*\{/);
    for (const token of requiredTokens) {
      expect(css).toMatch(
        new RegExp(`--${token}:\\s*[01](?:\\.\\d+)?\\s+\\d+(?:\\.\\d+)?\\s+\\d+`),
      );
    }
    expect(css).toContain(
      '"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif',
    );
    expect(css).toContain("min-height: 100dvh");
    expect(css).toContain("text-wrap: balance");
    expect(css).toContain("text-wrap: pretty");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).not.toMatch(/--(?:cream|paper|sand|beige|bone|ivory)\b/i);
    expect(css).not.toMatch(/gradient-text|bg-clip-text|background-clip:\s*text/i);
  });

  test("maps Tailwind colors directly to OKLCH semantic variables", () => {
    const config = read("tailwind.config.ts");

    expect(config).toContain('oklch(var(--background) / <alpha-value>)');
    expect(config).toContain('oklch(var(--success) / <alpha-value>)');
    expect(config).toContain('oklch(var(--warning) / <alpha-value>)');
    expect(config).not.toContain("hsl(var(--");
  });

  test("keeps text, primary actions, focus rings, and input boundaries accessible", () => {
    const css = read("app/globals.css");
    const rootBlock = css.match(/:root\s*\{([^}]+)\}/)?.[1] ?? "";
    const darkBlock = css.match(/\.dark\s*\{([^}]+)\}/)?.[1] ?? "";

    for (const block of [rootBlock, darkBlock]) {
      const background = getToken(block, "background");

      expect(contrastRatio(background, getToken(block, "foreground"))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(background, getToken(block, "muted-foreground"))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(getToken(block, "primary"), getToken(block, "primary-foreground"))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(background, getToken(block, "ring"))).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(background, getToken(block, "input"))).toBeGreaterThanOrEqual(3);
    }
  });

  test("keeps the shell server-rendered and composes header, main, and footer", () => {
    const shell = read("components/official-site/site-shell.tsx");

    expect(shell).not.toMatch(/^\s*["']use client["'];?/m);
    expect(shell).toContain("<SiteHeader");
    expect(shell).toMatch(/<main[^>]*>[\s\S]*\{children\}[\s\S]*<\/main>/);
    expect(shell).toContain("<SiteFooter");
    expect(shell).toContain("min-h-[100dvh]");
  });

  test("isolates client behavior to theme and mobile navigation leaves", () => {
    const provider = read("components/theme-provider.tsx");
    const toggle = read("components/theme-toggle.tsx");
    const header = read("components/official-site/site-header.tsx");
    const mobileNavigation = read(
      "components/official-site/mobile-navigation.tsx",
    );
    const footer = read("components/official-site/site-footer.tsx");
    const shell = read("components/official-site/site-shell.tsx");

    expect(provider).toMatch(/^\s*["']use client["'];?/m);
    expect(toggle).toMatch(/^\s*["']use client["'];?/m);
    expect(header).not.toMatch(/^\s*["']use client["'];?/m);
    expect(mobileNavigation).toMatch(/^\s*["']use client["'];?/m);
    expect(footer).not.toMatch(/^\s*["']use client["'];?/m);
    expect(shell).not.toMatch(/^\s*["']use client["'];?/m);
  });

  test("configures one system-aware ThemeProvider around SiteShell", () => {
    const layout = read("app/layout.tsx");

    expect(layout).not.toMatch(/^\s*["']use client["'];?/m);
    expect(layout).toContain('<html lang="zh-CN" suppressHydrationWarning>');
    expect(layout.match(/<ThemeProvider\b/g)).toHaveLength(1);
    expect(layout).toContain('attribute="class"');
    expect(layout).toContain('defaultTheme="system"');
    expect(layout).toMatch(/\benableSystem\b/);
    expect(layout).toMatch(/<ThemeProvider[\s\S]*<SiteShell>\s*\{children\}\s*<\/SiteShell>[\s\S]*<\/ThemeProvider>/);
  });

  test("uses a compact single-line desktop header and accessible Dialog mobile nav", () => {
    const header = read("components/official-site/site-header.tsx");
    const mobileNavigation = read(
      "components/official-site/mobile-navigation.tsx",
    );

    expect(header).toMatch(/h-(?:16|18)|max-h-18/);
    expect(header).toContain("whitespace-nowrap");
    expect(mobileNavigation).toContain("Dialog");
    expect(mobileNavigation).toContain("DialogTitle");
    expect(mobileNavigation).toContain("DialogTrigger");
    expect(mobileNavigation).toContain("asChild");
    expect(header).not.toMatch(/h-screen|z-\[|z-\d+/);
    expect(mobileNavigation).not.toMatch(/h-screen|z-\[|z-\d+/);
  });

  test("does not expose navigation links to missing home-page anchors", () => {
    const navigationSource = [
      read("components/official-site/site-header.tsx"),
      read("components/official-site/mobile-navigation.tsx"),
      read("components/official-site/site-footer.tsx"),
    ].join("\n");
    const page = read("app/page.tsx");

    for (const [, target] of navigationSource.matchAll(/href=["']\/#([^"']+)/g)) {
      expect(page).toContain(`id="${target}"`);
    }
  });

  test("does not retain animation utilities without a configured animation plugin", () => {
    const config = read("tailwind.config.ts");
    const overlaySources = [
      read("components/ui/dialog.tsx"),
      read("components/ui/select.tsx"),
    ].join("\n");

    expect(config).not.toMatch(/tailwindcss-animate|tw-animate-css/);
    expect(overlaySources).not.toMatch(/animate-in|animate-out|fade-(?:in|out)|zoom-(?:in|out)|slide-(?:in|out)/);
  });

  test("keeps shell copy functional and free of decorative status language", () => {
    const shellCopy = [
      read("components/official-site/site-header.tsx"),
      read("components/official-site/site-footer.tsx"),
      read("components/official-site/site-shell.tsx"),
    ].join("\n");

    expect(shellCopy).not.toMatch(/[—–]/);
    expect(shellCopy).not.toMatch(/(?:version|build|weather|天气|气温|v\d+\.\d+)/i);
  });

  test("provides all requested official UI source components with resolvable aliases", () => {
    const allSource = requiredUiFiles.map((path) => read(path)).join("\n");

    for (const path of requiredUiFiles) {
      expect(existsSync(new URL(path, root))).toBe(true);
    }
    expect(read("components/official-site/mobile-navigation.tsx")).toContain(
      '@/components/ui/dialog',
    );
    expect(allSource).not.toMatch(/from ["']~\//);
  });

  test("keeps every UI source compatible with the configured Tailwind 3 compiler", () => {
    const uiDirectory = new URL("components/ui/", root);
    const allUiSource = readdirSync(uiDirectory)
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => read(`components/ui/${file}`))
      .join("\n");

    expect(allUiSource).not.toMatch(/(?:^|\s)@container(?:\/[^\s"']+)?/);
    expect(allUiSource).not.toMatch(/@(?:sm|md|lg|xl|2xl)\//);
    expect(allUiSource).not.toContain("has-data-");
    expect(allUiSource).not.toMatch(/nth-last-\d/);
  });
});
