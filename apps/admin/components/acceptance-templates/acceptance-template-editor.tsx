"use client";

import {
  Loader2,
  Plus,
  RotateCcw,
  Save,
} from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import {
  acceptanceTemplateStatusOptions,
  ACCEPTANCE_TEMPLATE_ALL_VALUE,
  getAcceptanceTemplateStageLabel,
  getAcceptanceTypeLabel,
} from "@/components/acceptance-templates/acceptance-template-options";
import {
  createEmptyTemplateItem,
  createEmptyTemplateSection,
} from "@/components/acceptance-templates/acceptance-template-editor-utils";
import {
  CheckboxField,
  MoveDeleteActions,
  PhotoCountFields,
  moveItem,
} from "@/components/acceptance-templates/acceptance-template-editor-controls";
import type {
  AcceptanceTemplate,
  AcceptanceTemplateItem,
  AcceptanceTemplateSection,
} from "@/components/projects/project-acceptance-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function AcceptanceTemplateEditor({
  draft,
  selectedTemplate,
  saving,
  onDraftChange,
  onSectionsChange,
  onReset,
  onSave,
}: {
  draft: AcceptanceTemplate | null;
  selectedTemplate: AcceptanceTemplate | null;
  saving: boolean;
  onDraftChange: (patch: Partial<AcceptanceTemplate>) => void;
  onSectionsChange: (
    updater: (sections: AcceptanceTemplateSection[]) => AcceptanceTemplateSection[],
  ) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const sections = draft?.sections || [];

  if (!draft) {
    return (
      <section className="flex min-h-0 flex-col">
        <Empty className="h-full border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Plus aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>请选择模板</EmptyTitle>
            <EmptyDescription>
              从左侧选择一个验收模板后维护分组、检查项和拍照要求。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b bg-card px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold">
              {draft.name || "未命名模板"}
            </h2>
            <Badge variant="outline">
              {getAcceptanceTypeLabel(draft.acceptance_type)}
            </Badge>
            <Badge variant="outline">
              {getAcceptanceTemplateStageLabel(draft.stage_code)}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            修改保存后只影响后续新建验收单，已创建验收单继续使用创建时的模板快照。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving || !selectedTemplate}
            onClick={onReset}
          >
            <RotateCcw data-icon="inline-start" />
            还原
          </Button>
          <Button type="button" disabled={saving} onClick={onSave}>
            {saving ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            保存模板
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <FieldGroup>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_160px]">
            <Field>
              <FieldLabel htmlFor="template-name">模板名称</FieldLabel>
              <Input
                id="template-name"
                value={draft.name}
                disabled={saving}
                onChange={(event) => onDraftChange({ name: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="template-status">状态</FieldLabel>
              <FormSelect
                id="template-status"
                value={draft.status === "inactive" ? "inactive" : "active"}
                disabled={saving}
                options={acceptanceTemplateStatusOptions.filter((option) =>
                  option.value !== ACCEPTANCE_TEMPLATE_ALL_VALUE
                )}
                onChange={(value) => onDraftChange({ status: value })}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="template-description">模板说明</FieldLabel>
            <Textarea
              id="template-description"
              value={draft.description || ""}
              disabled={saving}
              onChange={(event) =>
                onDraftChange({ description: event.target.value })}
            />
            <FieldDescription>
              说明会展示给后台维护人员，用于区分模板用途。
            </FieldDescription>
          </Field>

          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <div>
              <div className="text-sm font-semibold">验收分组与检查项</div>
              <div className="text-xs text-muted-foreground">
                每个分组至少保留一个检查项。
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() =>
                onSectionsChange((current) => [
                  ...current,
                  createEmptyTemplateSection(),
                ])}
            >
              <Plus data-icon="inline-start" />
              添加分组
            </Button>
          </div>

          <div className="flex flex-col gap-4">
            {sections.map((section, sectionIndex) => (
              <TemplateSectionEditor
                key={`${section.id || "new"}-${sectionIndex}`}
                section={section}
                sectionIndex={sectionIndex}
                disabled={saving}
                canRemove={sections.length > 1}
                onChange={(patch) =>
                  onSectionsChange((current) =>
                    current.map((item, index) =>
                      index === sectionIndex ? { ...item, ...patch } : item
                    )
                  )}
                onRemove={() =>
                  onSectionsChange((current) =>
                    current.filter((_, index) => index !== sectionIndex)
                  )}
                onMove={(direction) =>
                  onSectionsChange((current) =>
                    moveItem(current, sectionIndex, direction)
                  )}
                onItemsChange={(items) =>
                  onSectionsChange((current) =>
                    current.map((item, index) =>
                      index === sectionIndex ? { ...item, items } : item
                    )
                  )}
              />
            ))}
          </div>
        </FieldGroup>
      </div>
    </section>
  );
}

function TemplateSectionEditor({
  section,
  sectionIndex,
  disabled,
  canRemove,
  onChange,
  onRemove,
  onMove,
  onItemsChange,
}: {
  section: AcceptanceTemplateSection;
  sectionIndex: number;
  disabled: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<AcceptanceTemplateSection>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onItemsChange: (items: AcceptanceTemplateItem[]) => void;
}) {
  return (
    <section className="rounded-md border bg-card">
      <div className="flex flex-col gap-3 border-b bg-muted/20 p-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="grid min-w-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Field>
            <FieldLabel htmlFor={`section-title-${sectionIndex}`}>分组名称</FieldLabel>
            <Input
              id={`section-title-${sectionIndex}`}
              value={section.title}
              disabled={disabled}
              onChange={(event) => onChange({ title: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`section-description-${sectionIndex}`}>分组说明</FieldLabel>
            <Input
              id={`section-description-${sectionIndex}`}
              value={section.description || ""}
              disabled={disabled}
              onChange={(event) => onChange({ description: event.target.value })}
            />
          </Field>
        </div>
        <MoveDeleteActions
          disabled={disabled}
          canRemove={canRemove}
          isFirst={sectionIndex === 0}
          onMove={onMove}
          onRemove={onRemove}
        />
      </div>

      <div className="flex flex-col gap-3 p-3">
        {section.items.map((item, itemIndex) => (
          <TemplateItemEditor
            key={`${item.id || "new"}-${itemIndex}`}
            item={item}
            itemIndex={itemIndex}
            disabled={disabled}
            canRemove={section.items.length > 1}
            onChange={(patch) =>
              onItemsChange(
                section.items.map((current, index) =>
                  index === itemIndex ? { ...current, ...patch } : current
                ),
              )}
            onRemove={() =>
              onItemsChange(section.items.filter((_, index) => index !== itemIndex))}
            onMove={(direction) =>
              onItemsChange(moveItem(section.items, itemIndex, direction))}
          />
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onItemsChange([...section.items, createEmptyTemplateItem()])}
          >
            <Plus data-icon="inline-start" />
            添加检查项
          </Button>
        </div>
      </div>
    </section>
  );
}

function TemplateItemEditor({
  item,
  itemIndex,
  disabled,
  canRemove,
  onChange,
  onRemove,
  onMove,
}: {
  item: AcceptanceTemplateItem;
  itemIndex: number;
  disabled: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<AcceptanceTemplateItem>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(180px,0.8fr)_minmax(260px,1.4fr)_120px]">
        <Field>
          <FieldLabel htmlFor={`template-item-title-${itemIndex}`}>检查项</FieldLabel>
          <Input
            id={`template-item-title-${itemIndex}`}
            value={item.title}
            disabled={disabled}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`template-item-standard-${itemIndex}`}>验收标准</FieldLabel>
          <Input
            id={`template-item-standard-${itemIndex}`}
            value={item.standard}
            disabled={disabled}
            onChange={(event) => onChange({ standard: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`template-item-category-${itemIndex}`}>分类</FieldLabel>
          <Input
            id={`template-item-category-${itemIndex}`}
            value={item.category || ""}
            disabled={disabled}
            onChange={(event) => onChange({ category: event.target.value || null })}
          />
        </Field>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_auto] xl:items-end">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CheckboxField
            label="必检"
            checked={item.required}
            disabled={disabled}
            onChange={(checked) => onChange({ required: checked })}
          />
          <CheckboxField
            label="允许不适用"
            checked={item.allow_not_applicable}
            disabled={disabled}
            onChange={(checked) => onChange({ allow_not_applicable: checked })}
          />
          <CheckboxField
            label="需要照片"
            checked={item.photo_required}
            disabled={disabled}
            onChange={(checked) => onChange({ photo_required: checked })}
          />
          <CheckboxField
            label="不通过需备注"
            checked={item.remark_required_on_fail}
            disabled={disabled}
            onChange={(checked) => onChange({ remark_required_on_fail: checked })}
          />
        </div>
        <PhotoCountFields item={item} itemIndex={itemIndex} disabled={disabled} onChange={onChange} />
        <MoveDeleteActions
          disabled={disabled}
          canRemove={canRemove}
          isFirst={itemIndex === 0}
          onMove={onMove}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
}
