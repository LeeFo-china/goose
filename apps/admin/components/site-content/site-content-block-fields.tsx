"use client";

import type { SiteContentDraftBlock } from "@gooes/domain";

import { FormSelect } from "@/components/admin/form-select";
import { SiteContentImageField } from "@/components/site-content/site-content-image-field";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const headingOptions = [
  { value: "2", label: "二级标题" },
  { value: "3", label: "三级标题" },
];
const listOptions = [
  { value: "unordered", label: "无序列表" },
  { value: "ordered", label: "有序列表" },
];
const calloutOptions = [
  { value: "info", label: "提示" },
  { value: "warning", label: "警告" },
];

function parsePairs(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [label, ...rest] = line.split("|");
    return { label: label?.trim() || "", value: rest.join("|").trim() };
  });
}
export function SiteContentBlockFields({
  id,
  block,
  disabled,
  onChange,
}: {
  id: string;
  block: SiteContentDraftBlock;
  disabled?: boolean;
  onChange: (block: SiteContentDraftBlock) => void;
}) {
  if (block.type === "paragraph") {
    return (
      <Field>
        <FieldLabel htmlFor={`${id}-text`}>正文</FieldLabel>
        <Textarea id={`${id}-text`} rows={6} value={block.text} disabled={disabled} onChange={(event) => onChange({ ...block, text: event.target.value })} />
      </Field>
    );
  }

  if (block.type === "heading") {
    return (
      <FieldGroup className="grid gap-4 md:grid-cols-[180px_1fr]">
        <Field>
          <FieldLabel htmlFor={`${id}-level`}>层级</FieldLabel>
          <FormSelect id={`${id}-level`} value={String(block.level)} options={headingOptions} disabled={disabled} onChange={(value) => onChange({ ...block, level: value === "3" ? 3 : 2 })} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-text`}>标题</FieldLabel>
          <Input id={`${id}-text`} value={block.text} disabled={disabled} onChange={(event) => onChange({ ...block, text: event.target.value })} />
        </Field>
      </FieldGroup>
    );
  }

  if (block.type === "image") {
    return <SiteContentImageField id={id} value={block} disabled={disabled} onChange={(image) => onChange({ type: "image", ...image })} />;
  }

  if (block.type === "quote") {
    return (
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-text`}>引文</FieldLabel>
          <Textarea id={`${id}-text`} rows={4} value={block.text} disabled={disabled} onChange={(event) => onChange({ ...block, text: event.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-attribution`}>出处</FieldLabel>
          <Input id={`${id}-attribution`} value={block.attribution || ""} disabled={disabled} onChange={(event) => onChange({ ...block, attribution: event.target.value || undefined })} />
        </Field>
      </FieldGroup>
    );
  }

  if (block.type === "list") {
    return (
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-style`}>列表样式</FieldLabel>
          <FormSelect id={`${id}-style`} value={block.style} options={listOptions} disabled={disabled} onChange={(value) => onChange({ ...block, style: value === "ordered" ? "ordered" : "unordered" })} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-items`}>列表项（每行一项）</FieldLabel>
          <Textarea id={`${id}-items`} rows={6} value={block.items.join("\n")} disabled={disabled} onChange={(event) => onChange({ ...block, items: event.target.value.split("\n") })} />
        </Field>
      </FieldGroup>
    );
  }

  if (block.type === "callout") {
    return (
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-tone`}>语气</FieldLabel>
          <FormSelect id={`${id}-tone`} value={block.tone} options={calloutOptions} disabled={disabled} onChange={(value) => onChange({ ...block, tone: value === "warning" ? "warning" : "info" })} />
        </Field>
        <Field><FieldLabel htmlFor={`${id}-title`}>标题</FieldLabel><Input id={`${id}-title`} value={block.title} disabled={disabled} onChange={(event) => onChange({ ...block, title: event.target.value })} /></Field>
        <Field><FieldLabel htmlFor={`${id}-text`}>内容</FieldLabel><Textarea id={`${id}-text`} rows={4} value={block.text} disabled={disabled} onChange={(event) => onChange({ ...block, text: event.target.value })} /></Field>
      </FieldGroup>
    );
  }

  if (block.type === "metrics") {
    return (
      <Field>
        <FieldLabel htmlFor={`${id}-metrics`}>指标（每行“名称|数值”）</FieldLabel>
        <Textarea id={`${id}-metrics`} rows={6} value={block.items.map((item) => `${item.label}|${item.value}`).join("\n")} disabled={disabled} onChange={(event) => onChange({ ...block, items: parsePairs(event.target.value) })} />
      </Field>
    );
  }

  return (
    <FieldGroup>
      {block.images.map((image, index) => (
        <SiteContentImageField key={`${id}-${index}`} id={`${id}-${index}`} value={image} disabled={disabled} onChange={(nextImage) => onChange({ ...block, images: block.images.map((item, itemIndex) => itemIndex === index ? nextImage : item) })} />
      ))}
      <button type="button" className="self-start text-sm font-medium text-foreground underline underline-offset-4 disabled:opacity-50" disabled={disabled} onClick={() => onChange({ ...block, images: [...block.images, { fileId: "", alt: "" }] })}>添加画廊图片</button>
    </FieldGroup>
  );
}
