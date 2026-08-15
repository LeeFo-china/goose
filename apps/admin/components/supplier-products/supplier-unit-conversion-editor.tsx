"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { CatalogOption } from "./supplier-product-types";
import {
  buildConversionChainSummary,
  validateConversionEdges,
  type UnitReferenceForConversion,
} from "./supplier-unit-conversion-rules";

export type SupplierUnitConversionEdge = {
  fromUnitId: string;
  toUnitId: string;
  factor: string;
};

export function SupplierUnitConversionEditor({
  units,
  purchaseUnitId,
  edges,
  onChange,
}: {
  units: CatalogOption[];
  purchaseUnitId: string;
  edges: SupplierUnitConversionEdge[];
  onChange: (edges: SupplierUnitConversionEdge[]) => void;
}) {
  const [fromUnitId, setFromUnitId] = useState("");
  const [toUnitId, setToUnitId] = useState("");
  const [factor, setFactor] = useState("1");

  const unitRefs: UnitReferenceForConversion[] = units.map((unit) => ({
    id: unit.id,
    symbol: unit.symbol,
    name: unit.name,
  }));

  const validationError = validateConversionEdges(edges);
  const summary = purchaseUnitId && edges.length > 0
    ? buildConversionChainSummary(edges, unitRefs, purchaseUnitId)
    : "";

  function addEdge() {
    if (!fromUnitId || !toUnitId || !factor.trim()) return;
    onChange([
      ...edges,
      { fromUnitId, toUnitId, factor: factor.trim() },
    ]);
    setFromUnitId("");
    setToUnitId("");
    setFactor("1");
  }

  function removeEdge(index: number) {
    onChange(edges.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <FieldGroup>
      <div className="text-sm font-medium">单位换算链</div>
      <FieldGroup className="grid gap-3 md:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="conversion-from">从单位</FieldLabel>
          <FormSelect
            id="conversion-from"
            value={fromUnitId}
            options={units.map((unit) => ({
              value: unit.id,
              label: `${unit.name}${unit.symbol ? `（${unit.symbol}）` : ""}`,
            }))}
            onChange={setFromUnitId}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="conversion-to">到单位</FieldLabel>
          <FormSelect
            id="conversion-to"
            value={toUnitId}
            options={units.map((unit) => ({
              value: unit.id,
              label: `${unit.name}${unit.symbol ? `（${unit.symbol}）` : ""}`,
            }))}
            onChange={setToUnitId}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="conversion-factor">系数</FieldLabel>
          <Input
            id="conversion-factor"
            type="number"
            min="0"
            step="any"
            value={factor}
            onChange={(event) => setFactor(event.target.value)}
          />
        </Field>
        <div className="flex items-end">
          <Button type="button" size="sm" onClick={addEdge}>
            <Plus data-icon="inline-start" />
            添加
          </Button>
        </div>
      </FieldGroup>
      {edges.length > 0 ? (
        <ul className="divide-y text-sm">
          {edges.map((edge, index) => (
            <li key={`${edge.fromUnitId}-${edge.toUnitId}`} className="flex items-center justify-between p-2">
              <span>
                1 {unitName(edge.fromUnitId, unitRefs)} = {edge.factor}{" "}
                {unitName(edge.toUnitId, unitRefs)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeEdge(index)}
              >
                <Trash2 data-icon="inline-start" />
                删除
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {validationError ? (
        <div className="text-sm text-destructive">{validationError}</div>
      ) : null}
      {summary ? (
        <div className="text-sm text-muted-foreground">摘要：{summary}</div>
      ) : null}
    </FieldGroup>
  );
}

function unitName(id: string, units: UnitReferenceForConversion[]) {
  const unit = units.find((item) => item.id === id);
  return unit?.symbol || unit?.name || id;
}
