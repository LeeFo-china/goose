import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("workflow node config contract labels", () => {
  test("shows procedure and payment node attributes required by runtime contract", () => {
    const procedureSource = readFileSync(
      new URL("./workflow-procedure-config-fields.tsx", import.meta.url),
      "utf8",
    );
    const paymentSource = readFileSync(
      new URL("./workflow-payment-collection-config-fields.tsx", import.meta.url),
      "utf8",
    );

    expect(procedureSource).toContain("require_log");
    expect(procedureSource).toContain("min_image_count");
    expect(procedureSource).toContain("acceptance_enabled");
    expect(procedureSource).toContain("require_procedure_assignment");
    expect(procedureSource).toContain("default_duration_days");
    expect(procedureSource).toContain("allow_duration_override");
    expect(procedureSource).toContain("candidate_department_codes");
    expect(paymentSource).toContain("收款要求");
    expect(paymentSource).toContain("金额/比例规则");
    expect(paymentSource).toContain("财务负责人");
  });
});
