"use client";

import type { CatalogSpecValue } from "@gooes/domain";

import { FormSelect } from "@/components/admin/form-select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import type { CatalogSpecDefinition } from "./supplier-product-types";

export function SupplierSpecFields({
  definitions,
  values,
  onChange,
}: {
  definitions: CatalogSpecDefinition[];
  values: Record<string, CatalogSpecValue>;
  onChange: (code: string, value: CatalogSpecValue | undefined) => void;
}) {
  if (definitions.length === 0) {
    return (
      <FieldDescription>
        当前分类没有启用的结构化规格模板。
      </FieldDescription>
    );
  }

  return (
    <FieldSet>
      <FieldLegend variant="label">结构化规格</FieldLegend>
      <FieldDescription>
        规格值按分类模板保存，是筛选和采购快照的事实来源。
      </FieldDescription>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        {definitions.map((definition) => (
          <SpecField
            key={definition.id}
            definition={definition}
            value={values[definition.code]}
            onChange={(value) => onChange(definition.code, value)}
          />
        ))}
      </FieldGroup>
    </FieldSet>
  );
}

function SpecField({
  definition,
  value,
  onChange,
}: {
  definition: CatalogSpecDefinition;
  value: CatalogSpecValue | undefined;
  onChange: (value: CatalogSpecValue | undefined) => void;
}) {
  const id = `supplier-sku-spec-${definition.code}`;
  const label = `${definition.name}${definition.is_required ? " *" : ""}`;
  if (definition.value_type === "boolean") {
    return (
      <Field orientation="horizontal">
        <Switch
          id={id}
          checked={value === true}
          onCheckedChange={onChange}
        />
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
      </Field>
    );
  }
  if (definition.value_type === "single_enum") {
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FormSelect
          id={id}
          value={typeof value === "string" ? value : ""}
          options={definition.enum_options.map((option) => ({
            value: option,
            label: option,
          }))}
          onChange={onChange}
        />
      </Field>
    );
  }
  if (definition.value_type === "multi_enum") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <FieldSet>
        <FieldLegend variant="label">{label}</FieldLegend>
        <FieldGroup className="gap-2">
          {definition.enum_options.map((option) => {
            const optionId = `${id}-${option}`;
            return (
              <Field key={option} orientation="horizontal">
                <Checkbox
                  id={optionId}
                  checked={selected.includes(option)}
                  onCheckedChange={(checked) => onChange(
                    checked
                      ? [...selected, option]
                      : selected.filter((item) => item !== option),
                  )}
                />
                <FieldLabel htmlFor={optionId} className="font-normal">
                  {option}
                </FieldLabel>
              </Field>
            );
          })}
        </FieldGroup>
      </FieldSet>
    );
  }
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={definition.value_type === "number"
          ? "number"
          : definition.value_type === "date"
            ? "date"
            : "text"}
        value={typeof value === "string" || typeof value === "number" ? value : ""}
        onChange={(event) => onChange(event.target.value === ""
          ? undefined
          : definition.value_type === "number"
            ? Number(event.target.value)
            : event.target.value)}
      />
      {definition.unit_dimension ? (
        <FieldDescription>计量维度：{definition.unit_dimension}</FieldDescription>
      ) : null}
    </Field>
  );
}
