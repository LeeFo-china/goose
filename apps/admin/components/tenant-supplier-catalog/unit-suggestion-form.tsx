"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { submitUnitSuggestion } from "./tenant-supplier-catalog-api";
import { validateUnitSuggestion } from "./tenant-supplier-catalog-rules";

export function UnitSuggestionForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [dimension, setDimension] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    const error = validateUnitSuggestion({ name, symbol, dimension, note });
    if (error) {
      toast.error(error);
      return;
    }
    setPending(true);
    try {
      await submitUnitSuggestion(
        { name: name.trim(), symbol: symbol.trim(), dimension: dimension.trim(), note: note.trim() || null },
        crypto.randomUUID(),
      );
      toast.success("单位建议已提交");
      setName("");
      setSymbol("");
      setDimension("");
      setNote("");
      onSubmitted();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "提交单位建议失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="p-4 text-sm font-medium">提交单位建议</CardHeader>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            aria-label="单位名称"
            placeholder="单位名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            aria-label="单位符号"
            placeholder="单位符号"
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
          />
          <Input
            aria-label="计量维度"
            placeholder="计量维度"
            value={dimension}
            onChange={(event) => setDimension(event.target.value)}
          />
        </div>
        <Textarea
          aria-label="建议说明"
          placeholder="建议说明（可选）"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <Button
          type="button"
          disabled={pending}
          onClick={handleSubmit}
          className="self-start"
        >
          {pending ? "提交中..." : "提交"}
        </Button>
      </CardContent>
    </Card>
  );
}
