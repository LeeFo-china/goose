import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("HTTP browser fixture facts satisfy the real API strict record schemas", () => {
  const result = spawnSync("bun", [
    "-e",
    `
    import * as f from "../admin/e2e/supplier-purchase-batch-fixture.mjs";
    import * as s from "./src/repositories/supplier-purchase-batch-records.ts";
    import { SupplierPurchaseBatchCommandEnvelopeSchema } from "./src/repositories/supplier-purchase-batch-command-records.ts";
    import * as commands from "../admin/e2e/supplier-purchase-batch-command-fixture.mjs";
    import { SupplierPurchaseBatchWorkflowRepository } from "./src/repositories/supplier-purchase-batch-workflow.ts";
    for (const warehouse of [false, true]) {
      const record = f.batchRecord(warehouse ? {destination_type:"warehouse",project_id:null,warehouse_id:f.warehouses[21].id,budget_status:"not_applicable"} : {});
      s.SupplierPurchaseBatchRecordSchema.parse(record);
      const detail = f.batchDetail(record);
      const {creator, applicant, approval_summary, actions, workflow_state, ...databaseDetail} = detail;
      s.SupplierPurchaseBatchDetailSchema.parse(databaseDetail);
      s.SupplierPurchaseBatchRequisitionSchema.parse(f.childRequisition(record));
      s.SupplierPurchaseBatchOrderSchema.parse(f.childOrder(record));
      const items = f.catalog().slice(0, 2).map((item, index) => f.batchItem(item, index));
      SupplierPurchaseBatchCommandEnvelopeSchema.parse({status:"saved",idempotent:false,batch:record,version:record.version,split_preview:commands.splitPreview(items)});
      SupplierPurchaseBatchCommandEnvelopeSchema.parse({status:"revision_required",idempotent:false,...commands.priceRevision(record)});
      const {workflow_state: submitWorkflow, ...legacySubmit} = commands.commandResult("submit", {...record,status:"pending_approval"}, items);
      SupplierPurchaseBatchCommandEnvelopeSchema.parse(legacySubmit);
      SupplierPurchaseBatchCommandEnvelopeSchema.parse(commands.commandResult("review", {...record,status:"ordered"}, items));
      for (const [kind, status] of [["submit","pending_approval"],["review","pending_approval"],["withdraw","draft"]]) {
        const result = commands.commandResult(kind, {...record,status,approval_round:1}, items);
        const repository = new SupplierPurchaseBatchWorkflowRepository(() => ({rpc: async () => ({data:result,error:null})}));
        if (kind === "submit") await repository.submit({batch_id:record.id,tenant_id:record.tenant_id,expected_version:0,actor_user_id:f.ids.user,actor_employee_id:f.ids.employee,idempotency_key:"fixture"});
        else if (kind === "review") await repository.completeTask({batchId:record.id,tenantId:record.tenant_id,taskId:f.uuid(800),action:"approve",reason:null,output:{},actorUserId:f.ids.user,actorEmployeeId:f.ids.employee,idempotencyKey:"fixture"});
        else await repository.withdraw({batchId:record.id,tenantId:record.tenant_id,expectedVersion:0,reason:null,actorUserId:f.ids.user,actorEmployeeId:f.ids.employee,idempotencyKey:"fixture"});
      }
    }
    for (const item of f.catalog()) {
      s.SupplierPurchaseBatchCatalogItemSchema.parse(item);
      s.SupplierPurchaseBatchItemSchema.parse(f.batchItem(item));
    }
  `,
  ], {
    cwd: fileURLToPath(new URL("../../../api/", import.meta.url)),
    encoding: "utf8",
    env: {
      ...process.env,
      SUPABASE_URL: "http://127.0.0.1:1",
      SUPABASE_PUBLISH: "test",
      SUPABASE_SERVICE_ROLE_KEY: "test",
    },
  });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});
