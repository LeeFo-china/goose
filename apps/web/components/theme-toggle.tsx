"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

const themeOrder = ["system", "light", "dark"] as const;

const themeLabels: Record<(typeof themeOrder)[number], string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

export function ThemeToggle(): React.JSX.Element {
  const [isMounted, setIsMounted] = useState(false);
  const { setTheme, theme = "system" } = useTheme();

  useEffect(() => setIsMounted(true), []);

  const currentTheme = themeOrder.includes(
    theme as (typeof themeOrder)[number],
  )
    ? (theme as (typeof themeOrder)[number])
    : "system";
  const currentIndex = themeOrder.indexOf(currentTheme);
  const nextTheme = themeOrder[(currentIndex + 1) % themeOrder.length];
  const label = isMounted ? themeLabels[currentTheme] : themeLabels.system;

  return (
    <Button
      aria-label={`当前主题：${label}，切换到${themeLabels[nextTheme]}`}
      className="h-11 md:h-9"
      onClick={() => setTheme(nextTheme)}
      size="sm"
      type="button"
      variant="ghost"
    >
      主题：{label}
    </Button>
  );
}
