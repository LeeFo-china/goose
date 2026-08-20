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
    "--background": "210 33% 98%",
    "--foreground": "204 70% 16%",
    "--primary": "203 88% 29%",
    "--ring": "203 88% 29%",
    "--accent": "20 100% 58%",
    "--accent-foreground": "204 70% 16%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "205 42% 93%",
    "--secondary-foreground": "204 70% 20%",
    "--muted": "207 33% 95%",
    "--border": "207 24% 86%",
    "--input": "207 24% 82%",
    "--goose-yellow": "#095488",
    "--goose-yellow-soft": "#d7e7f1",
    "--goose-cream": "#f8fafc",
    "--goose-cream-deep": "#edf3f7",
    "--goose-ink": "#0b2f46",
    "--goose-brown": "#35556a",
    "--goose-surface-warm": "#f4f8fb",
  },
  neutral: {
    "--background": "220 20% 98%",
    "--foreground": "222 47% 11%",
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
  },
  blue: {
    "--background": "214 100% 98%",
    "--foreground": "222 47% 11%",
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
  },
  green: {
    "--background": "150 60% 98%",
    "--foreground": "158 64% 16%",
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
  },
  cyan: {
    "--background": "186 65% 98%",
    "--foreground": "193 82% 20%",
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
  },
  indigo: {
    "--background": "226 60% 98%",
    "--foreground": "239 84% 20%",
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
  },
  rose: {
    "--background": "340 65% 98%",
    "--foreground": "346 77% 22%",
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
  },
  amber: {
    "--background": "38 70% 98%",
    "--foreground": "28 80% 18%",
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
