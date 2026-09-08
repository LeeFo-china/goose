"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SUPPLIER_PURCHASE_PURPOSE_PRESETS } from "@gooes/domain";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import {
  shouldRequestPurposeChange,
  synchronizePurposeCustomState,
} from "./procurement-editor-rules";

type ProcurementDestinationType = "project" | "warehouse";

export function ProcurementPurposeField({
  destinationType,
  value,
  disabled,
  error,
  onChange,
}: {
  destinationType: ProcurementDestinationType;
  value: string;
  disabled: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const presets: readonly string[] =
    SUPPLIER_PURCHASE_PURPOSE_PRESETS[destinationType];
  const isPreset = useMemo(
    () => presets.some((preset) => preset === value),
    [presets, value],
  );
  const [custom, setCustom] = useState(Boolean(value) && !isPreset);
  const requestedValue = useRef<string | null>(null);

  useEffect(() => {
    const pendingValue = requestedValue.current;
    requestedValue.current = null;
    setCustom((currentCustom) =>
      synchronizePurposeCustomState({
        currentCustom,
        value,
        isPreset,
        requestedValue: pendingValue,
      }).custom
    );
  }, [isPreset, value]);

  function changeValue(nextValue: string) {
    if (!shouldRequestPurposeChange(value, nextValue)) return;
    requestedValue.current = nextValue;
    onChange(nextValue);
  }

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel id="procurement-purpose-label">采购用途</FieldLabel>
      <div
        role="group"
        aria-labelledby="procurement-purpose-label"
        aria-describedby={error ? "procurement-purpose-error" : undefined}
        className="flex min-w-0 flex-wrap gap-2"
      >
        {presets.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={value === preset ? "default" : "outline"}
            disabled={disabled}
            aria-pressed={value === preset}
            onClick={() => {
              setCustom(false);
              changeValue(preset);
            }}
          >
            {preset}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={custom ? "default" : "outline"}
          disabled={disabled}
          aria-pressed={custom}
          onClick={() => {
            setCustom(true);
            if (isPreset) changeValue("");
          }}
        >
          其他
        </Button>
      </div>
      {custom ? (
        <Input
          id="procurement-purpose-custom"
          aria-label="自定义采购用途"
          aria-describedby={error ? "procurement-purpose-error" : undefined}
          aria-invalid={Boolean(error)}
          value={isPreset ? "" : value}
          maxLength={500}
          disabled={disabled}
          placeholder="一句话说明采购用途"
          onChange={(event) => changeValue(event.target.value)}
        />
      ) : null}
      <FieldError id="procurement-purpose-error">{error}</FieldError>
    </Field>
  );
}
