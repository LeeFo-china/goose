'use client';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SOURCE_LABELS, SPACE_LABELS, STYLE_LABELS, type StyleFieldsValue } from './contracts';
import { LibrarySelect } from './library-select';

export function StyleFields({ value, onChange, errors = {}, disabled = false }: {
  value: StyleFieldsValue; onChange: (value: StyleFieldsValue) => void; errors?: Record<string, string>; disabled?: boolean;
}) {
  return <FieldGroup>
    <Field data-invalid={Boolean(errors.title)}>
      <FieldLabel htmlFor="rendering-title">标题</FieldLabel>
      <Input id="rendering-title" value={value.title} maxLength={80} disabled={disabled} aria-invalid={Boolean(errors.title)} aria-describedby="rendering-title-error"
        onChange={(event) => onChange({ ...value, title: event.target.value })} />
      <FieldError id="rendering-title-error">{errors.title}</FieldError>
    </Field>
    <FieldGroup className="grid sm:grid-cols-2">
      <LibrarySelect id="rendering-space" label="空间" value={value.space} labels={SPACE_LABELS} disabled={disabled} error={errors.space} onChange={(space) => { if (space) onChange({ ...value, space }); }} />
      <LibrarySelect id="rendering-style" label="风格" value={value.style} labels={STYLE_LABELS} disabled={disabled} error={errors.style} onChange={(style) => { if (style) onChange({ ...value, style }); }} />
      <LibrarySelect id="rendering-source" label="来源" value={value.source_type} labels={SOURCE_LABELS} disabled={disabled} error={errors.source_type} onChange={(source_type) => { if (source_type) onChange({ ...value, source_type }); }} />
      <Field data-invalid={Boolean(errors.sort_order)}><FieldLabel htmlFor="rendering-sort">排序</FieldLabel>
        <Input id="rendering-sort" type="number" min={0} max={100000} step={1} value={Number.isNaN(value.sort_order) ? '' : value.sort_order} disabled={disabled}
          aria-invalid={Boolean(errors.sort_order)} aria-describedby="rendering-sort-error" onChange={(event) => onChange({ ...value, sort_order: event.target.value === '' ? NaN : Number(event.target.value) })} />
        <FieldError id="rendering-sort-error">{errors.sort_order}</FieldError></Field>
    </FieldGroup>
    {(['color_notes', 'material_notes'] as const).map((key) => <Field key={key} data-invalid={Boolean(errors[key])}>
      <FieldLabel htmlFor={`rendering-${key}`}>{key === 'color_notes' ? '颜色说明' : '材质说明'}</FieldLabel>
      <Textarea id={`rendering-${key}`} value={value[key]} maxLength={300} rows={3} disabled={disabled} aria-invalid={Boolean(errors[key])} aria-describedby={`rendering-${key}-error`}
        onChange={(event) => onChange({ ...value, [key]: event.target.value })} />
      <FieldError id={`rendering-${key}-error`}>{errors[key]}</FieldError>
    </Field>)}
  </FieldGroup>;
}
