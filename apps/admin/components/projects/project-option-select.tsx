import { FormSelect } from "@/components/admin/form-select";
import type { Option } from "@/components/projects/project-mutation-types";

export function OptionSelect({
  id,
  value,
  options,
  disabled,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  options: Option[];
  disabled: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormSelect
      id={id}
      value={value || "__none"}
      disabled={disabled}
      options={[
        { value: "__none", label: placeholder },
        ...options.map((option) => ({
          value: option.id,
          label: option.description
            ? `${option.label} · ${option.description}`
            : option.label,
        })),
      ]}
      onChange={(nextValue) => onChange(nextValue === "__none" ? "" : nextValue)}
    />
  );
}
