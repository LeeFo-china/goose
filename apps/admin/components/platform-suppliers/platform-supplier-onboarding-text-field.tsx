import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SupplierOnboardingTextField({
  id,
  label,
  value,
  error,
  type = "text",
  maxLength,
  onBlur,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  type?: string;
  maxLength?: number;
  onBlur?: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
      {label === "联系方式" ? (
        <FieldDescription>建议填写手机号，支持座机或分机。</FieldDescription>
      ) : null}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
