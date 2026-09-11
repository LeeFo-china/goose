'use client';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';

export function UploadRights({ checked, disabled, error, onChange }: {
  checked: boolean; disabled: boolean; error?: string; onChange: (checked: boolean) => void;
}) {
  return <Field data-invalid={Boolean(error)}>
    <div className="flex items-start gap-3"><Checkbox id="rendering-upload-rights" checked={checked} disabled={disabled}
      aria-invalid={Boolean(error)} aria-describedby={error ? 'rendering-upload-rights-error' : undefined}
      onCheckedChange={(value) => onChange(value === true)} />
      <FieldLabel htmlFor="rendering-upload-rights" className="leading-5">我已取得这些图片的使用授权</FieldLabel></div>
    <FieldError id="rendering-upload-rights-error">{error}</FieldError>
  </Field>;
}
