export type ContentWidth = "compact" | "wide" | "full";
export type ThemeTone =
  | "goose"
  | "neutral"
  | "blue"
  | "green"
  | "cyan"
  | "indigo"
  | "rose"
  | "amber";

export type AdminPreferences = {
  preferenceVersion: number;
  sidebarCollapsed: boolean;
  compact: boolean;
  contentWidth: ContentWidth;
  themeTone: ThemeTone;
};

const STORAGE_KEY = "goose-admin-preferences";
const PREFERENCES_VERSION = 2;

export const defaultPreferences: AdminPreferences = {
  preferenceVersion: PREFERENCES_VERSION,
  sidebarCollapsed: false,
  compact: false,
  contentWidth: "full",
  themeTone: "goose",
};

const themeTokens: Record<ThemeTone, Record<string, string>> = {
  goose: {
    "--background": "46 100% 98%",
    "--primary": "0 0% 7%",
    "--ring": "44 100% 48%",
    "--accent": "47 100% 64%",
    "--accent-foreground": "0 0% 8%",
    "--primary-foreground": "47 100% 64%",
    "--secondary": "48 100% 91%",
    "--secondary-foreground": "46 100% 15%",
    "--muted": "47 85% 94%",
    "--border": "45 45% 86%",
    "--input": "45 45% 82%",
    "--goose-yellow": "#f3b400",
    "--goose-yellow-soft": "#ffd449",
    "--goose-cream": "#fffdf6",
    "--goose-cream-deep": "#fff5cf",
    "--goose-ink": "#141414",
    "--goose-brown": "#4d3b00",
    "--goose-surface-warm": "#fffbec",
    "--workbench-glow": "255 212 73",
    "--workbench-glow-alpha": "0.24",
    "--workbench-bg-start": "46 100% 99%",
    "--workbench-bg-mid": "47 100% 95%",
    "--workbench-bg-end": "46 100% 99%",
  },
  neutral: {
    "--background": "220 20% 98%",
    "--primary": "222 47% 11%",
    "--ring": "220 9% 46%",
    "--accent": "220 14% 96%",
    "--accent-foreground": "222 47% 11%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "220 14% 96%",
    "--secondary-foreground": "222 47% 11%",
    "--muted": "220 14% 96%",
    "--border": "220 13% 91%",
    "--input": "220 13% 87%",
    "--goose-yellow": "#111827",
    "--goose-yellow-soft": "#e5e7eb",
    "--goose-cream": "#f9fafb",
    "--goose-cream-deep": "#f3f4f6",
    "--goose-ink": "#111827",
    "--goose-brown": "#374151",
    "--goose-surface-warm": "#f9fafb",
    "--workbench-glow": "148 163 184",
    "--workbench-glow-alpha": "0.16",
    "--workbench-bg-start": "220 20% 99%",
    "--workbench-bg-mid": "220 14% 96%",
    "--workbench-bg-end": "220 20% 99%",
  },
  blue: {
    "--background": "214 100% 98%",
    "--primary": "221 83% 53%",
    "--ring": "221 83% 53%",
    "--accent": "214 100% 92%",
    "--accent-foreground": "222 47% 11%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "214 100% 94%",
    "--secondary-foreground": "222 47% 11%",
    "--muted": "214 100% 96%",
    "--border": "214 32% 88%",
    "--input": "214 32% 84%",
    "--goose-yellow": "#2563eb",
    "--goose-yellow-soft": "#bfdbfe",
    "--goose-cream": "#eff6ff",
    "--goose-cream-deep": "#eff6ff",
    "--goose-ink": "#111827",
    "--goose-brown": "#1e3a8a",
    "--goose-surface-warm": "#f8fbff",
    "--workbench-glow": "96 165 250",
    "--workbench-glow-alpha": "0.18",
    "--workbench-bg-start": "214 100% 99%",
    "--workbench-bg-mid": "214 100% 96%",
    "--workbench-bg-end": "214 100% 99%",
  },
  green: {
    "--background": "150 60% 98%",
    "--primary": "158 64% 24%",
    "--ring": "158 64% 35%",
    "--accent": "149 80% 90%",
    "--accent-foreground": "158 64% 16%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "149 80% 92%",
    "--secondary-foreground": "158 64% 16%",
    "--muted": "150 50% 95%",
    "--border": "152 30% 84%",
    "--input": "152 30% 80%",
    "--goose-yellow": "#047857",
    "--goose-yellow-soft": "#bbf7d0",
    "--goose-cream": "#ecfdf5",
    "--goose-cream-deep": "#ecfdf5",
    "--goose-ink": "#10251c",
    "--goose-brown": "#166534",
    "--goose-surface-warm": "#f7fef9",
    "--workbench-glow": "74 222 128",
    "--workbench-glow-alpha": "0.16",
    "--workbench-bg-start": "150 60% 99%",
    "--workbench-bg-mid": "150 55% 95%",
    "--workbench-bg-end": "150 60% 99%",
  },
  cyan: {
    "--background": "186 65% 98%",
    "--primary": "191 91% 30%",
    "--ring": "191 91% 36%",
    "--accent": "185 96% 90%",
    "--accent-foreground": "193 82% 20%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "185 96% 92%",
    "--secondary-foreground": "193 82% 20%",
    "--muted": "186 55% 95%",
    "--border": "186 35% 84%",
    "--input": "186 35% 80%",
    "--goose-yellow": "#0891b2",
    "--goose-yellow-soft": "#a5f3fc",
    "--goose-cream": "#ecfeff",
    "--goose-cream-deep": "#cffafe",
    "--goose-ink": "#0f172a",
    "--goose-brown": "#155e75",
    "--goose-surface-warm": "#f2feff",
    "--workbench-glow": "34 211 238",
    "--workbench-glow-alpha": "0.17",
    "--workbench-bg-start": "186 65% 99%",
    "--workbench-bg-mid": "186 65% 95%",
    "--workbench-bg-end": "186 65% 99%",
  },
  indigo: {
    "--background": "226 60% 98%",
    "--primary": "239 84% 42%",
    "--ring": "239 84% 48%",
    "--accent": "226 100% 94%",
    "--accent-foreground": "239 84% 20%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "226 100% 95%",
    "--secondary-foreground": "239 84% 20%",
    "--muted": "226 55% 96%",
    "--border": "226 35% 86%",
    "--input": "226 35% 82%",
    "--goose-yellow": "#4338ca",
    "--goose-yellow-soft": "#c7d2fe",
    "--goose-cream": "#eef2ff",
    "--goose-cream-deep": "#e0e7ff",
    "--goose-ink": "#111827",
    "--goose-brown": "#3730a3",
    "--goose-surface-warm": "#f7f8ff",
    "--workbench-glow": "129 140 248",
    "--workbench-glow-alpha": "0.16",
    "--workbench-bg-start": "226 60% 99%",
    "--workbench-bg-mid": "226 60% 96%",
    "--workbench-bg-end": "226 60% 99%",
  },
  rose: {
    "--background": "340 65% 98%",
    "--primary": "346 77% 42%",
    "--ring": "346 77% 48%",
    "--accent": "340 90% 94%",
    "--accent-foreground": "346 77% 22%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "340 90% 95%",
    "--secondary-foreground": "346 77% 22%",
    "--muted": "340 50% 96%",
    "--border": "340 35% 86%",
    "--input": "340 35% 82%",
    "--goose-yellow": "#be123c",
    "--goose-yellow-soft": "#fecdd3",
    "--goose-cream": "#fff1f2",
    "--goose-cream-deep": "#ffe4e6",
    "--goose-ink": "#191114",
    "--goose-brown": "#9f1239",
    "--goose-surface-warm": "#fff7f8",
    "--workbench-glow": "251 113 133",
    "--workbench-glow-alpha": "0.15",
    "--workbench-bg-start": "340 65% 99%",
    "--workbench-bg-mid": "340 65% 96%",
    "--workbench-bg-end": "340 65% 99%",
  },
  amber: {
    "--background": "38 70% 98%",
    "--primary": "32 95% 34%",
    "--ring": "32 95% 40%",
    "--accent": "39 96% 88%",
    "--accent-foreground": "28 80% 18%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "39 96% 91%",
    "--secondary-foreground": "28 80% 18%",
    "--muted": "39 55% 94%",
    "--border": "39 35% 82%",
    "--input": "39 35% 78%",
    "--goose-yellow": "#b45309",
    "--goose-yellow-soft": "#fde68a",
    "--goose-cream": "#fffbeb",
    "--goose-cream-deep": "#fef3c7",
    "--goose-ink": "#1f1608",
    "--goose-brown": "#92400e",
    "--goose-surface-warm": "#fffaf0",
    "--workbench-glow": "251 191 36",
    "--workbench-glow-alpha": "0.18",
    "--workbench-bg-start": "38 70% 99%",
    "--workbench-bg-mid": "39 70% 95%",
    "--workbench-bg-end": "38 70% 99%",
  },
};

function isThemeTone(value: unknown): value is ThemeTone {
  return typeof value === "string" && value in themeTokens;
}

export function loadPreferences() {
  if (typeof window === "undefined") return defaultPreferences;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPreferences;
    const parsed = JSON.parse(raw) as Partial<AdminPreferences>;
    const isCurrentVersion = parsed.preferenceVersion === PREFERENCES_VERSION;
    const contentWidth = isCurrentVersion
      ? parsed.contentWidth || defaultPreferences.contentWidth
      : parsed.contentWidth === "compact"
        ? "compact"
        : defaultPreferences.contentWidth;

    return {
      ...defaultPreferences,
      ...parsed,
      preferenceVersion: PREFERENCES_VERSION,
      contentWidth,
      themeTone: isThemeTone(parsed.themeTone) ? parsed.themeTone : defaultPreferences.themeTone,
    };
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(preferences: AdminPreferences) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export function applyThemeTone(themeTone: ThemeTone) {
  const root = document.documentElement;
  Object.entries(themeTokens[themeTone]).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}
