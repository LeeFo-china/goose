"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { AcceptanceTemplateItem } from "@/components/projects/project-acceptance-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function PhotoCountFields({
  item,
  itemIndex,
  disabled,
  onChange,
}: {
  item: AcceptanceTemplateItem;
  itemIndex: number;
  disabled: boolean;
  onChange: (patch: Partial<AcceptanceTemplateItem>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field>
        <FieldLabel htmlFor={`template-item-min-photo-${itemIndex}`}>最少照片</FieldLabel>
        <Input
          id={`template-item-min-photo-${itemIndex}`}
          type="number"
          min={0}
          max={9}
          value={item.photo_min_count}
          disabled={disabled}
          onChange={(event) =>
            onChange({ photo_min_count: normalizePhotoCount(event.target.value, 0) })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`template-item-max-photo-${itemIndex}`}>最多照片</FieldLabel>
        <Input
          id={`template-item-max-photo-${itemIndex}`}
          type="number"
          min={1}
          max={9}
          value={item.photo_max_count}
          disabled={disabled}
          onChange={(event) =>
            onChange({ photo_max_count: normalizePhotoCount(event.target.value, 9) })}
        />
      </Field>
    </div>
  );
}

export function MoveDeleteActions({
  disabled,
  canRemove,
  isFirst,
  onMove,
  onRemove,
}: {
  disabled: boolean;
  canRemove: boolean;
  isFirst: boolean;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || isFirst}
        onClick={() => onMove(-1)}
      >
        <ArrowUp data-icon="inline-start" />
        上移
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => onMove(1)}
      >
        <ArrowDown data-icon="inline-start" />
        下移
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || !canRemove}
        onClick={onRemove}
      >
        <Trash2 data-icon="inline-start" />
        删除
      </Button>
    </div>
  );
}

export function CheckboxField({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-md border bg-card px-3 text-sm">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next === true)}
      />
      <span>{label}</span>
    </label>
  );
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (!item) return items;
  next.splice(nextIndex, 0, item);
  return next;
}

function normalizePhotoCount(value: string, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(0, Math.min(9, Math.floor(numberValue)));
}
