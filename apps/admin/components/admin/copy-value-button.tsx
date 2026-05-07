"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyValueButton({
  value,
  label = "复制",
}: {
  value: string | number | null | undefined;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = value == null ? "" : String(value);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={!text}
      onClick={copy}
    >
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {copied ? "已复制" : label}
    </Button>
  );
}
