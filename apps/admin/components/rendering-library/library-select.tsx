'use client';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function LibrarySelect<Value extends string>({ id, label, value, labels, onChange, disabled, error, allLabel }: {
  id: string; label: string; value: Value | ''; labels: Record<Value, string>; onChange: (value: Value | '') => void;
  disabled?: boolean; error?: string; allLabel?: string;
}) {
  return <Field data-invalid={Boolean(error)} className="min-w-0">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select value={value || 'all'} disabled={disabled} onValueChange={(next) => {
      if (allLabel && next === 'all') onChange('');
      // Radix returns a string; only values from this controlled option map are accepted.
      else if (Object.hasOwn(labels, next)) onChange(next as Value);
    }}>
      <SelectTrigger id={id} aria-label={label} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="min-w-0 shadow-none"><SelectValue /></SelectTrigger>
      <SelectContent className="motion-reduce:animate-none"><SelectGroup>
        {allLabel ? <SelectItem value="all">{allLabel}</SelectItem> : null}
        {Object.entries<string>(labels).map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select>
    <FieldError id={`${id}-error`}>{error}</FieldError>
  </Field>;
}
