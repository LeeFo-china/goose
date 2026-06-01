"use client";

import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { h5PageDisplaySceneOptions } from "@/components/marketing/marketing-constants";
import type { H5MarketingPageDisplayScene } from "@/components/marketing/marketing-types";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import {
  buildPageUrl,
  type AiCreateSnapshot,
  type H5PageFormValues,
} from "@/components/marketing/h5-page-mutation-shared";

type FirstIssue = {
  path: PropertyKey[];
  message: string;
} | null;

export function H5PageCreateFields({
  values,
  tenantSlug,
  activePageCount,
  advancedOpen,
  aiInstruction,
  aiPending,
  aiSnapshot,
  aiError,
  error,
  firstIssue,
  setAdvancedOpen,
  setAiInstruction,
  setAiError,
  updateValue,
  regenerateSlug,
  generateAiCreateCopy,
  undoAiCreateCopy,
}: {
  values: H5PageFormValues;
  tenantSlug?: string | null;
  activePageCount: number;
  advancedOpen: boolean;
  aiInstruction: string;
  aiPending: boolean;
  aiSnapshot: AiCreateSnapshot | null;
  aiError: string;
  error: string;
  firstIssue: FirstIssue;
  setAdvancedOpen: (open: boolean) => void;
  setAiInstruction: (value: string) => void;
  setAiError: (value: string) => void;
  updateValue: (key: keyof H5PageFormValues, value: string | number) => void;
  regenerateSlug: () => void;
  generateAiCreateCopy: () => void;
  undoAiCreateCopy: () => void;
}) {
  return (
    <FieldGroup>
      <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-medium">AI 辅助生成</div>
            <div className="mt-1 text-xs text-muted-foreground">
              输入活动要求，AI 会直接回填页面标题和页面描述，路径不会被修改。
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {aiSnapshot ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={aiPending}
                onClick={undoAiCreateCopy}
              >
                <RefreshCw data-icon="inline-start" />
                撤销 AI 回填
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={aiPending}
              onClick={generateAiCreateCopy}
            >
              {aiPending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : aiSnapshot ? (
                <RefreshCw data-icon="inline-start" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              {aiSnapshot ? "重新生成" : "AI 生成"}
            </Button>
          </div>
        </div>
        <Field data-invalid={Boolean(aiError)}>
          <FieldLabel htmlFor="h5-page-create-ai-instruction">活动要求</FieldLabel>
          <Textarea
            id="h5-page-create-ai-instruction"
            value={aiInstruction}
            rows={3}
            aria-invalid={Boolean(aiError)}
            placeholder="例如：面向郑州老房翻新客户，突出免费量房、限时优惠、预约咨询"
            onChange={(event) => {
              setAiError("");
              setAiInstruction(event.target.value);
            }}
          />
          {aiError ? <FieldError>{aiError}</FieldError> : null}
        </Field>
      </div>
      <Field data-invalid={Boolean(firstIssue?.path[0] === "title")}>
        <FieldLabel htmlFor="h5-page-title">页面标题</FieldLabel>
        <Input
          id="h5-page-title"
          value={values.title}
          aria-invalid={Boolean(firstIssue?.path[0] === "title")}
          onChange={(event) => updateValue("title", event.target.value)}
          placeholder="例如：春季装修预约活动"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="h5-page-description">页面描述</FieldLabel>
        <Textarea
          id="h5-page-description"
          value={values.description || ""}
          onChange={(event) => updateValue("description", event.target.value)}
          placeholder="一句话描述活动权益"
        />
      </Field>
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">高级设置</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              活动路径已自动生成：
              {tenantSlug
                ? `/t/${tenantSlug}/p/${values.slug || "auto"}`
                : `/p/${values.slug || "auto"}`}
            </div>
          </div>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              {advancedOpen ? "收起" : "展开"}
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-3">
          <Field data-invalid={Boolean(firstIssue?.path[0] === "slug")}>
            <FieldLabel htmlFor="h5-page-slug">活动路径</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="h5-page-slug"
                value={values.slug}
                aria-invalid={Boolean(firstIssue?.path[0] === "slug")}
                onChange={(event) => updateValue("slug", event.target.value)}
                placeholder="h5-20260510-a1b2c3"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton onClick={regenerateSlug}>
                  <RefreshCw data-icon="inline-start" />
                  重新生成
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              发布后访问地址为 {buildPageUrl(values.slug || "auto", tenantSlug)}
            </FieldDescription>
            {firstIssue?.path[0] === "slug" ? (
              <FieldError>{firstIssue.message}</FieldError>
            ) : null}
          </Field>
        </CollapsibleContent>
      </Collapsible>
      <div className="grid gap-3 md:grid-cols-2">
        <Field data-invalid={Boolean(firstIssue?.path[0] === "display_scene")}>
          <FieldLabel htmlFor="h5-page-display-scene">展示场景</FieldLabel>
          <FormSelect
            id="h5-page-display-scene"
            value={values.display_scene}
            options={h5PageDisplaySceneOptions.map(([value, label]) => ({ value, label }))}
            invalid={Boolean(firstIssue?.path[0] === "display_scene")}
            onChange={(value) => updateValue("display_scene", value as H5MarketingPageDisplayScene)}
          />
        </Field>
        <Field>
          <FieldLabel>发布后顺序</FieldLabel>
          <div className="flex min-h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
            第 {activePageCount + 1} 位
          </div>
          <FieldDescription>
            草稿不占展示位，发布时会按当时有效活动自动排到最后。
          </FieldDescription>
        </Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="h5-page-start-at">开始展示</FieldLabel>
          <Input
            id="h5-page-start-at"
            type="datetime-local"
            value={values.start_at || ""}
            onChange={(event) => updateValue("start_at", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="h5-page-end-at">结束展示</FieldLabel>
          <Input
            id="h5-page-end-at"
            type="datetime-local"
            value={values.end_at || ""}
            onChange={(event) => updateValue("end_at", event.target.value)}
          />
        </Field>
      </div>
      {error ? (
        <Field data-invalid>
          <FieldError>{error}</FieldError>
        </Field>
      ) : null}
    </FieldGroup>
  );
}
