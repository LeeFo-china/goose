import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260830110500_add_supplier_purchase_batch_workflow_foundation.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

const WORKFLOW_SUBJECT_TYPES = [
  "manual",
  "customer",
  "project",
  "expense_request",
  "procedure",
  "supplier_purchase_batch",
] as const;

interface IndexValidationContract {
  readonly tag: string;
  readonly indexName: string;
  readonly isUnique: boolean;
  readonly keys: readonly string[];
  readonly opclasses: readonly string[];
  readonly collations: readonly (string | null)[];
  readonly options: readonly number[];
  readonly predicate: string | null;
}

const INDEX_VALIDATIONS = [
  {
    tag: "validate_running_purchase_batch_index",
    indexName: "workflow_instances_running_purchase_batch_uidx",
    isUnique: true,
    keys: ["tenant_id", "subject_type", "subject_id"],
    opclasses: [
      "pg_catalog.uuid_ops",
      "pg_catalog.text_ops",
      "pg_catalog.text_ops",
    ],
    collations: [null, "pg_catalog.default", "pg_catalog.default"],
    options: [0, 0, 0],
    predicate:
      "status = 'running'::text AND subject_type = 'supplier_purchase_batch'::text",
  },
  {
    tag: "validate_purchase_batch_lookup_index",
    indexName: "workflow_instances_purchase_batch_lookup_idx",
    isUnique: false,
    keys: [
      "tenant_id",
      "subject_type",
      "subject_id",
      "status",
      "created_at",
      "id",
    ],
    opclasses: [
      "pg_catalog.uuid_ops",
      "pg_catalog.text_ops",
      "pg_catalog.text_ops",
      "pg_catalog.text_ops",
      "pg_catalog.timestamptz_ops",
      "pg_catalog.uuid_ops",
    ],
    collations: [
      null,
      "pg_catalog.default",
      "pg_catalog.default",
      "pg_catalog.default",
      null,
      null,
    ],
    options: [0, 0, 0, 0, 3, 3],
    predicate: null,
  },
] as const satisfies readonly IndexValidationContract[];

function quotedEnd(source: string, start: number, quote: "'" | '"'): number {
  const isEscapeString = quote === "'" &&
    /(?:^|[^A-Za-z0-9_])[eE]$/.test(source.slice(0, start));
  let index = start + 1;

  while (index < source.length) {
    if (isEscapeString && source[index] === "\\") {
      index += 2;
    } else if (source[index] === quote && source[index + 1] === quote) {
      index += 2;
    } else if (source[index] === quote) {
      return index + 1;
    } else {
      index += 1;
    }
  }

  return source.length;
}

function dollarRegion(
  source: string,
  start: number,
): readonly [tag: string, bodyStart: number, bodyEnd: number] | null {
  const tag = source.slice(start).match(
    /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/,
  )?.[0];
  if (!tag) return null;

  const bodyStart = start + tag.length;
  const bodyEnd = source.indexOf(tag, bodyStart);
  return bodyEnd < 0 ? null : [tag, bodyStart, bodyEnd];
}

function stripSqlComments(source: string, stripDollarCode = true): string {
  let result = "";
  let index = 0;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (current === "'" || current === '"') {
      const end = quotedEnd(source, index, current);
      result += source.slice(index, end);
      index = end;
    } else if (current === "$" && dollarRegion(source, index)) {
      const [tag, bodyStart, bodyEnd] = dollarRegion(source, index)!;
      const body = source.slice(bodyStart, bodyEnd);
      const isCode = stripDollarCode && /\b(?:AS|DO)\s*$/i.test(result);
      result += tag + (isCode ? stripSqlComments(body, false) : body) + tag;
      index = bodyEnd + tag.length;
    } else if (current === "-" && next === "-") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
    } else if (current === "/" && next === "*") {
      let depth = 1;
      index += 2;
      while (index < source.length && depth > 0) {
        if (source.startsWith("/*", index)) {
          depth += 1;
          index += 2;
        } else if (source.startsWith("*/", index)) {
          depth -= 1;
          index += 2;
        } else {
          if (source[index] === "\n") result += "\n";
          index += 1;
        }
      }
    } else {
      result += current;
      index += 1;
    }
  }

  return result;
}

function splitTopLevelSqlStatements(source: string): string[] {
  const executable = stripSqlComments(source);
  const statements: string[] = [];
  let statementStart = 0;
  let index = 0;

  while (index < executable.length) {
    const current = executable[index];
    if (current === "'" || current === '"') {
      index = quotedEnd(executable, index, current);
    } else if (current === "$" && dollarRegion(executable, index)) {
      const [tag, , bodyEnd] = dollarRegion(executable, index)!;
      index = bodyEnd + tag.length;
    } else if (current === ";") {
      const statement = executable.slice(statementStart, index + 1).trim();
      if (statement) statements.push(statement);
      statementStart = index + 1;
      index += 1;
    } else {
      index += 1;
    }
  }

  const trailingStatement = executable.slice(statementStart).trim();
  if (trailingStatement) statements.push(trailingStatement);
  return statements;
}

function compact(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\[\s+/g, "[")
    .replace(/\s+\]/g, "]")
    .trim();
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function textArray(values: readonly (string | null)[]): string {
  return `ARRAY[${values.map((value) =>
    value === null ? "NULL" : sqlLiteral(value)
  ).join(", ")}]::text[]`;
}

function expectedIndexValidation(
  contract: IndexValidationContract,
): string {
  const delimiter = `$${contract.tag}$`;
  const uniqueCheck = contract.isUnique
    ? "index_definition.indisunique"
    : "NOT index_definition.indisunique";
  const predicateCheck = contract.predicate === null
    ? "index_definition.indpred IS NULL"
    : "pg_catalog.pg_get_expr( index_definition.indpred, " +
      "index_definition.indrelid, true ) = " + sqlLiteral(contract.predicate);

  return compact(`
    DO ${delimiter}
    DECLARE
      v_matches boolean;
    BEGIN
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index AS index_definition
        JOIN pg_catalog.pg_class AS index_relation
          ON index_relation.oid = index_definition.indexrelid
        JOIN pg_catalog.pg_namespace AS index_namespace
          ON index_namespace.oid = index_relation.relnamespace
        JOIN pg_catalog.pg_class AS table_relation
          ON table_relation.oid = index_definition.indrelid
        JOIN pg_catalog.pg_namespace AS table_namespace
          ON table_namespace.oid = table_relation.relnamespace
        JOIN pg_catalog.pg_am AS access_method
          ON access_method.oid = index_relation.relam
        WHERE index_namespace.nspname = 'public'
          AND index_relation.relname = '${contract.indexName}'
          AND index_relation.relkind = 'i'
          AND table_namespace.nspname = 'public'
          AND table_relation.relname = 'workflow_instances'
          AND access_method.amname = 'btree'
          AND ${uniqueCheck}
          AND index_definition.indisvalid
          AND index_definition.indisready
          AND index_definition.indislive
          AND NOT index_definition.indnullsnotdistinct
          AND index_definition.indnkeyatts = ${contract.keys.length}
          AND index_definition.indnatts = ${contract.keys.length}
          AND index_definition.indexprs IS NULL
          AND ARRAY(
            SELECT attribute_definition.attname::text
            FROM unnest(index_definition.indkey) WITH ORDINALITY
              AS key_column(attnum, ordinal)
            JOIN pg_catalog.pg_attribute AS attribute_definition
              ON attribute_definition.attrelid = index_definition.indrelid
             AND attribute_definition.attnum = key_column.attnum
            ORDER BY key_column.ordinal
          ) = ${textArray(contract.keys)}
          AND ARRAY(
            SELECT opclass_namespace.nspname || '.' || opclass_definition.opcname
            FROM unnest(index_definition.indclass) WITH ORDINALITY
              AS key_opclass(opclass_oid, ordinal)
            JOIN pg_catalog.pg_opclass AS opclass_definition
              ON opclass_definition.oid = key_opclass.opclass_oid
            JOIN pg_catalog.pg_namespace AS opclass_namespace
              ON opclass_namespace.oid = opclass_definition.opcnamespace
            ORDER BY key_opclass.ordinal
          ) = ${textArray(contract.opclasses)}
          AND ARRAY(
            SELECT CASE
              WHEN key_collation.collation_oid = 0 THEN NULL
              ELSE collation_namespace.nspname || '.' ||
                collation_definition.collname
            END
            FROM unnest(index_definition.indcollation) WITH ORDINALITY
              AS key_collation(collation_oid, ordinal)
            LEFT JOIN pg_catalog.pg_collation AS collation_definition
              ON collation_definition.oid = key_collation.collation_oid
            LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
              ON collation_namespace.oid = collation_definition.collnamespace
            ORDER BY key_collation.ordinal
          ) IS NOT DISTINCT FROM ${textArray(contract.collations)}
          AND ARRAY(
            SELECT key_option.option
            FROM unnest(index_definition.indoption) WITH ORDINALITY
              AS key_option(option, ordinal)
            ORDER BY key_option.ordinal
          ) = ARRAY[${contract.options.join(", ")}]::smallint[]
          AND ${predicateCheck}
      )
      INTO v_matches;

      IF NOT v_matches THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_INDEX_CONTRACT_MISMATCH',
          DETAIL = '${contract.indexName} catalog contract mismatch';
      END IF;
    END
    ${delimiter};
  `);
}

const structuralSql = stripSqlComments(sql);
const normalizedStatements = splitTopLevelSqlStatements(sql).map(compact);

function statementStarting(prefix: string): string {
  const matches = normalizedStatements.filter((statement) =>
    statement.startsWith(prefix)
  );
  expect(matches).toHaveLength(1);
  return matches[0] ?? "";
}

function validationStatement(contract: IndexValidationContract): string {
  return statementStarting(`DO $${contract.tag}$`);
}

function statementFingerprint(statement: string): string {
  const validation = INDEX_VALIDATIONS.find((contract) => {
    const delimiter = `$${contract.tag}$`;
    return statement.startsWith(`DO ${delimiter}`) &&
      statement.endsWith(`${delimiter};`);
  });
  return validation ? `DO ${validation.tag}` : statement;
}

describe("supplier purchase batch workflow foundation migration", () => {
  test("parses only executable top-level statements across comments and quoted bodies", () => {
    const fixture = `
      -- SET LOCAL lock_timeout = '1ms';
      SELECT '-- kept; /* kept */';
      DO $fixture$
      BEGIN
        -- ALTER TABLE public.fake ADD COLUMN hidden text;
        PERFORM '/* kept */;';
      END;
      $fixture$;
      /* GRANT ALL ON TABLE public.fake TO authenticated; */
      COMMIT;
    `;

    expect(splitTopLevelSqlStatements(fixture).map(compact)).toEqual([
      "SELECT '-- kept; /* kept */';",
      "DO $fixture$ BEGIN PERFORM '/* kept */;'; END; $fixture$;",
      "COMMIT;",
    ]);
  });

  test("allows only the exact bounded transactional statement sequence", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    expect(normalizedStatements.map(statementFingerprint)).toEqual([
      "BEGIN;",
      "SET LOCAL lock_timeout = '5s';",
      "SET LOCAL statement_timeout = '5min';",
      "ALTER TABLE public.supplier_purchase_batches ADD COLUMN approval_round integer NOT NULL DEFAULT 0;",
      "ALTER TABLE public.supplier_purchase_batches ADD CONSTRAINT supplier_purchase_batches_approval_round_check CHECK ( approval_round >= 0 );",
      "ALTER TABLE public.tenant_supplier_settings ADD COLUMN purchase_batch_workflow_enabled boolean NOT NULL DEFAULT false;",
      "ALTER TABLE public.tenant_supplier_settings ADD CONSTRAINT tenant_supplier_settings_purchase_batch_workflow_parent_check CHECK ( NOT purchase_batch_workflow_enabled OR ( module_enabled AND procurement_snapshot_v1_enabled ) );",
      "ALTER TABLE public.workflow_instances DROP CONSTRAINT workflow_instances_subject_type_check;",
      "ALTER TABLE public.workflow_instances ADD CONSTRAINT workflow_instances_subject_type_check CHECK ( subject_type IN ('manual', 'customer', 'project', 'expense_request', 'procedure', 'supplier_purchase_batch') );",
      "ALTER TABLE public.workflow_subject_states DROP CONSTRAINT workflow_subject_states_subject_type_check;",
      "ALTER TABLE public.workflow_subject_states ADD CONSTRAINT workflow_subject_states_subject_type_check CHECK ( subject_type IN ('manual', 'customer', 'project', 'expense_request', 'procedure', 'supplier_purchase_batch') );",
      "ALTER TABLE public.workflow_definition_bindings DROP CONSTRAINT workflow_definition_bindings_subject_check;",
      "ALTER TABLE public.workflow_definition_bindings ADD CONSTRAINT workflow_definition_bindings_subject_check CHECK ( subject_type IN ('project', 'supplier_purchase_batch') );",
      "CREATE UNIQUE INDEX IF NOT EXISTS workflow_instances_running_purchase_batch_uidx ON public.workflow_instances( tenant_id, subject_type, subject_id ) WHERE status = 'running' AND subject_type = 'supplier_purchase_batch';",
      "DO validate_running_purchase_batch_index",
      "CREATE INDEX IF NOT EXISTS workflow_instances_purchase_batch_lookup_idx ON public.workflow_instances( tenant_id, subject_type, subject_id, status, created_at DESC, id DESC );",
      "DO validate_purchase_batch_lookup_index",
      "COMMIT;",
    ]);
    expect(structuralSql).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|GRANT|REVOKE|EXECUTE)\b/i,
    );
  });

  test("ends with forward-fix rollback guidance and stays transactional", () => {
    expect(normalizedStatements[0]).toBe("BEGIN;");
    expect(normalizedStatements.at(-1)).toBe("COMMIT;");
    expect(sql).toMatch(
      /COMMIT;\s+-- Rollback: forward-fix\.[\s\S]*separately reviewed migration[\s\S]*never repair[^\n]*manually\.\s*$/i,
    );
    expect(structuralSql).not.toMatch(/\bCONCURRENTLY\b/i);
  });

  test("adds exact defaulted columns and complete named checks", () => {
    expect(statementStarting(
      "ALTER TABLE public.supplier_purchase_batches ADD COLUMN approval_round",
    )).toBe(
      "ALTER TABLE public.supplier_purchase_batches ADD COLUMN approval_round integer NOT NULL DEFAULT 0;",
    );
    expect(statementStarting(
      "ALTER TABLE public.supplier_purchase_batches ADD CONSTRAINT supplier_purchase_batches_approval_round_check",
    )).toBe(
      "ALTER TABLE public.supplier_purchase_batches ADD CONSTRAINT supplier_purchase_batches_approval_round_check CHECK ( approval_round >= 0 );",
    );
    expect(statementStarting(
      "ALTER TABLE public.tenant_supplier_settings ADD COLUMN purchase_batch_workflow_enabled",
    )).toBe(
      "ALTER TABLE public.tenant_supplier_settings ADD COLUMN purchase_batch_workflow_enabled boolean NOT NULL DEFAULT false;",
    );
    expect(statementStarting(
      "ALTER TABLE public.tenant_supplier_settings ADD CONSTRAINT tenant_supplier_settings_purchase_batch_workflow_parent_check",
    )).toBe(
      "ALTER TABLE public.tenant_supplier_settings ADD CONSTRAINT tenant_supplier_settings_purchase_batch_workflow_parent_check CHECK ( NOT purchase_batch_workflow_enabled OR ( module_enabled AND procurement_snapshot_v1_enabled ) );",
    );
  });

  test("rebuilds every known workflow subject check with exact complete expressions", () => {
    const constraints = [
      {
        table: "workflow_instances",
        name: "workflow_instances_subject_type_check",
        types: WORKFLOW_SUBJECT_TYPES,
      },
      {
        table: "workflow_subject_states",
        name: "workflow_subject_states_subject_type_check",
        types: WORKFLOW_SUBJECT_TYPES,
      },
      {
        table: "workflow_definition_bindings",
        name: "workflow_definition_bindings_subject_check",
        types: ["project", "supplier_purchase_batch"],
      },
    ] as const;

    for (const contract of constraints) {
      expect(statementStarting(
        `ALTER TABLE public.${contract.table} DROP CONSTRAINT ${contract.name}`,
      )).toBe(
        `ALTER TABLE public.${contract.table} DROP CONSTRAINT ${contract.name};`,
      );
      expect(statementStarting(
        `ALTER TABLE public.${contract.table} ADD CONSTRAINT ${contract.name}`,
      )).toBe(
        `ALTER TABLE public.${contract.table} ADD CONSTRAINT ${contract.name} CHECK ( subject_type IN (${contract.types.map((value) => `'${value}'`).join(", ")}) );`,
      );
    }
  });

  test("creates the exact idempotent running and lookup indexes", () => {
    expect(statementStarting(
      "CREATE UNIQUE INDEX IF NOT EXISTS workflow_instances_running_purchase_batch_uidx",
    )).toBe(
      "CREATE UNIQUE INDEX IF NOT EXISTS workflow_instances_running_purchase_batch_uidx ON public.workflow_instances( tenant_id, subject_type, subject_id ) WHERE status = 'running' AND subject_type = 'supplier_purchase_batch';",
    );
    expect(statementStarting(
      "CREATE INDEX IF NOT EXISTS workflow_instances_purchase_batch_lookup_idx",
    )).toBe(
      "CREATE INDEX IF NOT EXISTS workflow_instances_purchase_batch_lookup_idx ON public.workflow_instances( tenant_id, subject_type, subject_id, status, created_at DESC, id DESC );",
    );
  });

  test("fails closed unless both same-name indexes match every catalog invariant", () => {
    for (const contract of INDEX_VALIDATIONS) {
      expect(validationStatement(contract)).toBe(
        expectedIndexValidation(contract),
      );
    }
  });

  test("introduces no executable or relation privilege surface", () => {
    expect(structuralSql).not.toMatch(
      /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i,
    );
    expect(structuralSql).not.toMatch(/\bCREATE\s+TABLE\b/i);
    expect(structuralSql).not.toMatch(/\bGRANT\b/i);
    expect(structuralSql).not.toMatch(/\bauthenticated\b/i);
  });
});
