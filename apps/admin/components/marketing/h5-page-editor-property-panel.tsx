"use client";

import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import type { H5Block, H5BlockType } from "@/components/marketing/h5-page-editor-types";
import { blockAiFieldSchema, blockLabel } from "@/components/marketing/h5-page-editor-types";
import { ActionDetailFields, ActionField, SelectField, TextareaField, TextField } from "@/components/marketing/h5-page-editor-fields";
import { ImageUploadField } from "@/components/marketing/h5-page-editor-image-upload-field";
import { ProjectCaseSelector } from "@/components/marketing/h5-page-editor-project-case-selector";
import {
  clampNumber,
  getActionString,
  getActionType,
  getFloatingPhoneProps,
  getString,
  normalizeLeadFormFields,
  parseCaseItems,
} from "@/components/marketing/h5-page-editor-block-utils";

export function PropertyPanel({
  block,
  aiPending,
  onChange,
  onAiFill,
}: {
  block: H5Block | null;
  aiPending?: boolean;
  onChange: (props: Record<string, unknown>) => void;
  onAiFill?: (block: H5Block) => void;
}) {
  if (!block) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        请选择中间预览中的一个模块，或从左侧添加新模块。
      </div>
    );
  }

  const props = block.props || {};
  const update = (key: string, value: unknown) => onChange({ ...props, [key]: value });
  const updateAction = (key: string, type: string) => update(key, { type });
  const updateActionValue = (key: string, field: string, value: string) => {
    const current = props[key];
    const currentAction = current && typeof current === "object"
      ? current as Record<string, unknown>
      : { type: "scroll_to_form" };
    update(key, { ...currentAction, [field]: value });
  };

  return (
    <FieldGroup>
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{blockLabel[block.type]}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{block.id}</div>
          </div>
          {onAiFill && Object.keys(blockAiFieldSchema[block.type] || {}).length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={aiPending}
              onClick={() => onAiFill(block)}
            >
              {aiPending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              AI 填写
            </Button>
          ) : null}
        </div>
      </div>

      {block.type === "hero" ? (
        <>
          <TextField label="角标" value={getString(props, "kicker")} onChange={(value) => update("kicker", value)} />
          <TextField label="标题" value={getString(props, "title")} onChange={(value) => update("title", value)} />
          <TextareaField label="副标题" value={getString(props, "subtitle")} onChange={(value) => update("subtitle", value)} />
          <ImageUploadField label="背景图片" usage="hero" value={getString(props, "imageUrl")} onChange={(value) => update("imageUrl", value)} />
          <TextField label="按钮文案" value={getString(props, "buttonText")} onChange={(value) => update("buttonText", value)} />
          <ActionField label="按钮动作" value={getActionType(props, "buttonAction")} onChange={(value) => updateAction("buttonAction", value)} />
          <ActionDetailFields
            type={getActionType(props, "buttonAction")}
            url={getActionString(props, "buttonAction", "url")}
            phone={getActionString(props, "buttonAction", "phone")}
            onUrlChange={(value) => updateActionValue("buttonAction", "url", value)}
            onPhoneChange={(value) => updateActionValue("buttonAction", "phone", value)}
          />
        </>
      ) : null}

      {block.type === "image" ? (
        <>
          <ImageUploadField label="图片" usage="content" value={getString(props, "imageUrl")} onChange={(value) => update("imageUrl", value)} />
          <TextField label="图片说明" value={getString(props, "caption")} onChange={(value) => update("caption", value)} />
        </>
      ) : null}

      {block.type === "text" ? (
        <>
          <TextField label="标题" value={getString(props, "title")} onChange={(value) => update("title", value)} />
          <TextareaField label="正文" value={getString(props, "content")} onChange={(value) => update("content", value)} />
          <SelectField
            label="对齐"
            value={getString(props, "align") || "left"}
            options={[
              { value: "left", label: "左对齐" },
              { value: "center", label: "居中" },
              { value: "right", label: "右对齐" },
            ]}
            onChange={(value) => update("align", value)}
          />
        </>
      ) : null}

      {block.type === "button" ? (
        <>
          <TextField label="按钮文案" value={getString(props, "text")} onChange={(value) => update("text", value)} />
          <ActionField label="按钮动作" value={getActionType(props, "action")} onChange={(value) => updateAction("action", value)} />
          <ActionDetailFields
            type={getActionType(props, "action")}
            url={getActionString(props, "action", "url")}
            phone={getActionString(props, "action", "phone")}
            onUrlChange={(value) => updateActionValue("action", "url", value)}
            onPhoneChange={(value) => updateActionValue("action", "phone", value)}
          />
        </>
      ) : null}

      {block.type === "image_text" ? (
        <>
          <ImageUploadField label="图片" usage="content" value={getString(props, "imageUrl")} onChange={(value) => update("imageUrl", value)} />
          <TextField label="标题" value={getString(props, "title")} onChange={(value) => update("title", value)} />
          <TextareaField label="正文" value={getString(props, "content")} onChange={(value) => update("content", value)} />
          <TextField label="按钮文案" value={getString(props, "buttonText")} onChange={(value) => update("buttonText", value)} />
          <ActionField label="按钮动作" value={getActionType(props, "buttonAction")} onChange={(value) => updateAction("buttonAction", value)} />
          <ActionDetailFields
            type={getActionType(props, "buttonAction")}
            url={getActionString(props, "buttonAction", "url")}
            phone={getActionString(props, "buttonAction", "phone")}
            onUrlChange={(value) => updateActionValue("buttonAction", "url", value)}
            onPhoneChange={(value) => updateActionValue("buttonAction", "phone", value)}
          />
        </>
      ) : null}

      {block.type === "case_list" ? (
        <>
          <TextField label="标题" value={getString(props, "title")} onChange={(value) => update("title", value)} />
          <ProjectCaseSelector
            items={parseCaseItems(props.items)}
            onChange={(items) => update("items", items)}
          />
        </>
      ) : null}

      {block.type === "countdown" ? (
        <>
          <TextField label="标题" value={getString(props, "title")} onChange={(value) => update("title", value)} />
          <TextField label="截止时间 ISO" value={getString(props, "endAt")} onChange={(value) => update("endAt", value)} />
        </>
      ) : null}

      {block.type === "lead_form" ? (
        <>
          <TextField label="标题" value={getString(props, "title")} onChange={(value) => update("title", value)} />
          <TextareaField label="说明" value={getString(props, "description")} onChange={(value) => update("description", value)} />
          <TextField
            label="字段"
            description="逗号分隔，例如 name,phone,community。手机号 phone 为必填字段，保存时会自动保留。"
            value={normalizeLeadFormFields(props.fields).join(",")}
            onChange={(value) => update("fields", normalizeLeadFormFields(value.split(",")))}
          />
          <TextField label="提交按钮" value={getString(props, "submitText")} onChange={(value) => update("submitText", value)} />
        </>
      ) : null}

      {block.type === "phone_cta" ? (
        <>
          <TextField label="按钮文案" value={getString(props, "text")} onChange={(value) => update("text", value)} />
          <TextField label="电话号码" value={getString(props, "phone")} onChange={(value) => update("phone", value)} />
        </>
      ) : null}

      {block.type === "floating_phone_cta" ? (
        <>
          <TextField label="按钮文案" value={getString(props, "text")} onChange={(value) => update("text", value)} />
          <TextField
            label="电话号码"
            description="点击悬浮按钮后会唤起手机拨号。"
            value={getString(props, "phone")}
            onChange={(value) => update("phone", value)}
          />
          <SelectField
            label="吸附位置"
            value={getFloatingPhoneProps(props).side}
            options={[
              { value: "left", label: "左侧" },
              { value: "right", label: "右侧" },
            ]}
            onChange={(value) => update("side", value)}
          />
          <TextField
            label="底部距离"
            description="单位 px，也可以直接在手机预览中拖动按钮调整。"
            value={String(getFloatingPhoneProps(props).bottom)}
            onChange={(value) => update("bottom", clampNumber(Number(value) || 96, 24, 520))}
          />
        </>
      ) : null}

      {block.type === "footer" ? (
        <>
          <TextField label="底部文字" value={getString(props, "text")} onChange={(value) => update("text", value)} />
          <ImageUploadField label="Logo" usage="logo" value={getString(props, "logo")} onChange={(value) => update("logo", value)} />
        </>
      ) : null}
    </FieldGroup>
  );
}
