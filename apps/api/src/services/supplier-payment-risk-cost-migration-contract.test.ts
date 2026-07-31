import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const oldRiskMigration = readMigration(
  "20260624160000_finance_project_risk_search.sql",
);
const task3Migration = readMigration(
  "20260731110000_create_supplier_payment_requests.sql",
);
const oldRiskDefinition = oldRiskMigration.slice(
  oldRiskMigration.indexOf(
    "create or replace function public.search_finance_project_risk_ids(",
  ),
  oldRiskMigration.indexOf("$$;") + 3,
);
const patch = task3Migration.slice(
  task3Migration.indexOf("DO $supplier_payment_aggregate_patch$"),
  task3Migration.indexOf("$supplier_payment_aggregate_patch$;", 1),
);

const cashAnchor = "l.direction = 'out'";
const supplierReReadMarker =
  "-- Re-read the effective definition after the supplier-payment exclusion.";
const patchSourceEvidence = [
  "v_old := E'),\\nreceivable_totals as (';",
  "v_old := $risk_patch$category_expenses as (",
  "v_old := 'coalesce(l.expense_amount, 0) as expense_amount';",
  "v_old := 'then coalesce(l.expense_amount, 0) / bt.budget_amount';",
  `v_old :=
    '(coalesce(l.income_amount, 0) - ' ||
    'coalesce(l.expense_amount, 0)) < 0';`,
  "v_old := 'left join ledger_totals l on l.project_id = bp.id';",
];
const sourceReplacements: Array<[string, string]> = [
  [
    "),\nreceivable_totals as (",
    `),
supplier_cost_totals as (
  select
    cost_event.project_id,
    coalesce(sum(cost_event.amount), 0)::numeric as supplier_cost_amount
  FROM public.project_cost_events cost_event
  join base_projects bp on bp.id = cost_event.project_id
  where cost_event.tenant_id = p_tenant_id
  group by cost_event.project_id
),
receivable_totals as (`,
  ],
  [
    `category_expenses as (
  select
    l.project_id,
    l.cost_category_id,
    coalesce(sum(l.amount), 0)::numeric as expense_amount
  from public.finance_ledger_entries l
  join base_projects bp on bp.id = l.project_id
  where l.tenant_id = p_tenant_id
    and l.direction = 'out' AND l.entry_type <> 'supplier_payment'
    and l.cost_category_id is not null
  group by l.project_id, l.cost_category_id
),`,
    `category_expenses as (
  select
    scoped.project_id,
    scoped.cost_category_id,
    coalesce(sum(scoped.amount), 0)::numeric as expense_amount
  from (
    select l.project_id, l.cost_category_id, l.amount
    from public.finance_ledger_entries l
    join base_projects bp on bp.id = l.project_id
    where l.tenant_id = p_tenant_id
      and l.direction = 'out' AND l.entry_type <> 'supplier_payment'
      and l.cost_category_id is not null
    UNION ALL
    select
      cost_event.project_id,
      cost_event.cost_category_id,
      cost_event.amount
    FROM public.project_cost_events cost_event
    join base_projects bp on bp.id = cost_event.project_id
    where cost_event.tenant_id = p_tenant_id
  ) scoped
  group by scoped.project_id, scoped.cost_category_id
),`,
  ],
  [
    "coalesce(l.expense_amount, 0) as expense_amount",
    `(coalesce(l.expense_amount, 0) +
    coalesce(sc.supplier_cost_amount, 0)) as expense_amount`,
  ],
  [
    "then coalesce(l.expense_amount, 0) / bt.budget_amount",
    `then (coalesce(l.expense_amount, 0) +
    coalesce(sc.supplier_cost_amount, 0)) / bt.budget_amount`,
  ],
  [
    "(coalesce(l.income_amount, 0) - coalesce(l.expense_amount, 0)) < 0",
    `(coalesce(l.income_amount, 0) - (coalesce(l.expense_amount, 0) + coalesce(sc.supplier_cost_amount, 0))) < 0`,
  ],
  [
    "left join ledger_totals l on l.project_id = bp.id",
    `left join ledger_totals l on l.project_id = bp.id
  left join supplier_cost_totals sc on sc.project_id = bp.id`,
  ],
];

describe("supplier payment project-risk cost patch", () => {
  test("applies every source anchor once to the true prior risk function", () => {
    expect(countOccurrences(oldRiskDefinition, cashAnchor)).toBe(3);
    let latestDefinition = oldRiskDefinition.replaceAll(
      cashAnchor,
      `${cashAnchor} AND l.entry_type <> 'supplier_payment'`,
    );

    for (const [source, replacement] of sourceReplacements) {
      expect(countOccurrences(latestDefinition, source)).toBe(1);
      latestDefinition = latestDefinition.replace(source, replacement);
    }
    for (const evidence of patchSourceEvidence) {
      expect(countOccurrences(patch, evidence)).toBe(1);
    }

    expect(countOccurrences(
      latestDefinition,
      "coalesce(sc.supplier_cost_amount, 0)",
    )).toBe(3);
    expect(countOccurrences(
      latestDefinition,
      "left join supplier_cost_totals sc on sc.project_id = bp.id",
    )).toBe(1);
    expect(latestDefinition).toContain("cost_event.cost_category_id");
    expect(latestDefinition).toContain("UNION ALL");
    expect(latestDefinition).toContain("count(*) over() as total_count");
    expect(latestDefinition).toContain(
      "row_number() over(order by f.created_at desc, f.project_id desc)",
    );
    expect(patch).toContain(
      "'coalesce(sc.supplier_cost_amount, 0)) as expense_amount'",
    );
    expect(patch).toContain(
      "'  left join supplier_cost_totals sc on sc.project_id = bp.id'",
    );
  });

  test("executes cash exclusion before re-reading and applying supplier cost", () => {
    const cashGuard = patch.indexOf("v_occurrences <> 3");
    const cashExecute = patch.indexOf("EXECUTE v_definition;", cashGuard);
    const supplierReRead = patch.indexOf(supplierReReadMarker);
    const supplierJoin = patch.indexOf(
      "left join supplier_cost_totals sc on sc.project_id = bp.id",
      supplierReRead,
    );
    const supplierExecute = patch.indexOf(
      "EXECUTE v_definition;",
      supplierJoin,
    );

    expect(cashGuard).toBeGreaterThan(-1);
    expect(cashExecute).toBeGreaterThan(cashGuard);
    expect(supplierReRead).toBeGreaterThan(cashExecute);
    expect(supplierExecute).toBeGreaterThan(supplierJoin);
    expect(patch.match(/v_occurrences <> 1/g)).toHaveLength(7);
    expect(patch.match(/EXECUTE v_definition;/g)).toHaveLength(4);
    expect(patch).not.toMatch(/\b(?:GRANT|REVOKE)\b/);
  });
});

function readMigration(filename: string) {
  return readFileSync(
    new URL(`../../../../supabase/migrations/${filename}`, import.meta.url),
    "utf8",
  );
}

function countOccurrences(value: string, source: string) {
  return value.split(source).length - 1;
}
