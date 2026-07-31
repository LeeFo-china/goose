import { describe, expect, test } from "bun:test";

import type { Database, Json } from "./database";
import type { Inserts, Tables, Updates } from "./db";

type Functions = Database["public"]["Functions"];
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Expect<Value extends true> = Value;

type PayableDueContract = Expect<
  Equal<Tables<"supplier_payable_events">["due_at"], string>
>;
type PaymentEvidenceContract = Expect<
  Equal<Tables<"supplier_payments">["evidence_images"], Json>
>;
type PayableListReturnContract = Expect<
  Equal<Functions["list_supplier_payables"]["Returns"], Json>
>;

const id = "00000000-0000-4000-8000-000000000001";

describe("supplier payment database types", () => {
  test("exposes supplier cost, payable, request, and payment tables", () => {
    const costEvent = {} as Tables<"project_cost_events">;
    const payableEvent = {} as Tables<"supplier_payable_events">;
    const request = {} as Tables<"supplier_payment_requests">;
    const requestAllocation =
      {} as Tables<"supplier_payment_request_allocations">;
    const payment = {} as Tables<"supplier_payments">;
    const paymentAllocation = {} as Tables<"supplier_payment_allocations">;

    const costEventInsert = {
      accepted_quantity: 1,
      amount: 100,
      cost_category_id: id,
      created_by_employee_id: id,
      occurred_at: "2026-07-31T00:00:00+00:00",
      project_id: id,
      source_id: id,
      supplier_id: id,
      supplier_purchase_order_id: id,
      supplier_purchase_order_item_id: id,
      supplier_purchase_order_receipt_id: id,
      supplier_purchase_order_receipt_item_id: id,
      tenant_id: id,
      tenant_supplier_id: id,
    } satisfies Inserts<"project_cost_events">;
    const payableEventInsert = {
      ...costEventInsert,
      due_at: "2026-08-30T00:00:00+00:00",
      invoice_required_before_payment: true,
    } satisfies Inserts<"supplier_payable_events">;
    const requestInsert = {
      created_by_employee_id: id,
      project_id: id,
      reason: "payment",
      supplier_id: id,
      tenant_id: id,
      tenant_supplier_id: id,
      updated_by_employee_id: id,
    } satisfies Inserts<"supplier_payment_requests">;
    const requestAllocationInsert = {
      payable_event_id: id,
      payment_request_id: id,
      requested_amount: 100,
      tenant_id: id,
    } satisfies Inserts<"supplier_payment_request_allocations">;
    const paymentInsert = {
      amount: 100,
      confirmed_by_employee_id: id,
      evidence_images: ["evidence"] satisfies Json,
      id,
      idempotency_key: id,
      paid_at: "2026-07-31T00:00:00+00:00",
      payment_method: "bank_transfer",
      payment_reference: "reference",
      payment_request_id: id,
      project_id: id,
      supplier_id: id,
      tenant_id: id,
      tenant_supplier_id: id,
    } satisfies Inserts<"supplier_payments">;
    const paymentAllocationInsert = {
      amount: 100,
      payable_event_id: id,
      payment_request_allocation_id: id,
      payment_request_id: id,
      supplier_payment_id: id,
      tenant_id: id,
    } satisfies Inserts<"supplier_payment_allocations">;

    void costEvent;
    void payableEvent;
    void request;
    void requestAllocation;
    void payment;
    void paymentAllocation;
    expect(costEventInsert.amount).toBe(100);
    expect(payableEventInsert.invoice_required_before_payment).toBe(true);
    expect(requestInsert.reason).toBe("payment");
    expect(requestAllocationInsert.requested_amount).toBe(100);
    expect(paymentInsert.payment_reference).toBe("reference");
    expect(paymentAllocationInsert.amount).toBe(100);
  });

  test("exposes supplier accounting changes on existing tables", () => {
    const commitmentUpdate = {
      consumed_at: "2026-07-31T00:00:00+00:00",
      recognized_amount: 100,
      status: "consumed",
    } satisfies Updates<"project_cost_commitments">;
    const purchaseOrderUpdate = {
      commercial_snapshot_source: "contract_snapshot",
      invoice_required_before_payment_snapshot: true,
      settlement_term_days_snapshot: 30,
    } satisfies Updates<"supplier_purchase_orders">;
    const purchaseOrderItemUpdate = {
      cost_category_id: id,
    } satisfies Updates<"supplier_purchase_order_items">;
    const financeLedgerUpdate = {
      amount: 100,
      entry_type: "supplier_payment",
    } satisfies Updates<"finance_ledger_entries">;
    const commandEventUpdate = {
      resource_type: "supplier_payment_request",
    } satisfies Updates<"supplier_command_events">;

    expect(commitmentUpdate.recognized_amount).toBe(100);
    expect(commitmentUpdate.status).toBe("consumed");
    expect(purchaseOrderUpdate.settlement_term_days_snapshot).toBe(30);
    expect(purchaseOrderUpdate.commercial_snapshot_source)
      .toBe("contract_snapshot");
    expect(purchaseOrderItemUpdate.cost_category_id).toBe(id);
    expect(financeLedgerUpdate.entry_type).toBe("supplier_payment");
    expect(commandEventUpdate.resource_type).toBe("supplier_payment_request");
  });

  test("exposes supplier payable query RPC arguments", () => {
    const listPayables: Functions["list_supplier_payables"]["Args"] = {
      p_due_from: "2026-07-01T00:00:00+00:00",
      p_due_to: "2026-08-01T00:00:00+00:00",
      p_page: 1,
      p_page_size: 20,
      p_project_id: id,
      p_purchase_order_id: id,
      p_status: "open",
      p_tenant_id: id,
      p_tenant_supplier_id: id,
      p_visible_project_ids: [id],
    };
    const payableBatch: Functions["get_supplier_payables_by_ids"]["Args"] = {
      p_payable_event_ids: [id],
      p_tenant_id: id,
      p_visible_project_ids: [id],
    };
    const filterOptions:
      Functions["list_supplier_payable_filter_options"]["Args"] = {
        p_keyword: "supplier",
        p_page: 1,
        p_page_size: 20,
        p_tenant_id: id,
        p_type: "supplier",
        p_visible_project_ids: [id],
      };
    const summary:
      Functions["get_supplier_purchase_order_financial_summary"]["Args"] = {
        p_supplier_purchase_order_id: id,
        p_tenant_id: id,
      };
    const legacyGaps:
      Functions["list_supplier_accounting_legacy_gaps"]["Args"] = {
        p_page: 1,
        p_page_size: 20,
        p_tenant_id: id,
      };
    const defaultPayableQuery:
      Functions["list_supplier_payables"]["Args"] = {
        p_tenant_id: id,
      };
    const defaultFilterQuery:
      Functions["list_supplier_payable_filter_options"]["Args"] = {
        p_tenant_id: id,
      };

    expect(listPayables.p_page_size).toBe(20);
    expect(payableBatch.p_payable_event_ids).toEqual([id]);
    expect(filterOptions.p_type).toBe("supplier");
    expect(summary.p_supplier_purchase_order_id).toBe(id);
    expect(legacyGaps.p_page).toBe(1);
    expect(defaultPayableQuery).toEqual({ p_tenant_id: id });
    expect(defaultFilterQuery).toEqual({ p_tenant_id: id });
  });

  test("exposes supplier payment request query RPC arguments", () => {
    const listRequests:
      Functions["list_supplier_payment_requests"]["Args"] = {
        p_created_from: "2026-07-01T00:00:00+00:00",
        p_created_to: "2026-08-01T00:00:00+00:00",
        p_keyword: "SPR",
        p_page: 1,
        p_page_size: 20,
        p_project_id: id,
        p_status: "draft",
        p_tenant_id: id,
        p_tenant_supplier_id: id,
        p_visible_project_ids: [id],
      };
    const detail:
      Functions["get_supplier_payment_request_detail"]["Args"] = {
        p_payment_request_id: id,
        p_tenant_id: id,
      };
    const payments:
      Functions["list_supplier_payment_request_payments"]["Args"] = {
        p_page: 1,
        p_page_size: 20,
        p_payment_request_id: id,
        p_tenant_id: id,
      };
    const defaultRequestQuery:
      Functions["list_supplier_payment_requests"]["Args"] = {
        p_tenant_id: id,
      };
    const defaultPaymentsQuery:
      Functions["list_supplier_payment_request_payments"]["Args"] = {
        p_payment_request_id: id,
        p_tenant_id: id,
      };

    expect(listRequests.p_visible_project_ids).toEqual([id]);
    expect(detail.p_payment_request_id).toBe(id);
    expect(payments.p_page_size).toBe(20);
    expect(defaultRequestQuery).toEqual({ p_tenant_id: id });
    expect(defaultPaymentsQuery).toEqual({
      p_payment_request_id: id,
      p_tenant_id: id,
    });
  });

  test("exposes supplier payment command RPC arguments", () => {
    const baseCommand = {
      p_actor_employee_id: id,
      p_actor_user_id: id,
      p_expected_version: 1,
      p_idempotency_key: id,
      p_payment_request_id: id,
      p_tenant_id: id,
    };
    const save: Functions["save_supplier_payment_request_draft"]["Args"] = {
      ...baseCommand,
      p_allocations: [{ payable_event_id: id, requested_amount: "100.00" }],
      p_project_id: id,
      p_reason: "payment",
      p_remark: "remark",
      p_tenant_supplier_id: id,
    };
    const submit: Functions["submit_supplier_payment_request"]["Args"] = {
      ...baseCommand,
    };
    const review: Functions["review_supplier_payment_request"]["Args"] = {
      ...baseCommand,
      p_action: "approve",
      p_remark: "approved",
    };
    const cancel: Functions["cancel_supplier_payment_request"]["Args"] = {
      ...baseCommand,
      p_reason: "cancelled",
    };
    const close: Functions["close_supplier_payment_request"]["Args"] = {
      ...baseCommand,
      p_reason: "closed",
    };
    const confirm: Functions["confirm_supplier_payment"]["Args"] = {
      ...baseCommand,
      p_allocations: [{ amount: "100.00", payment_request_allocation_id: id }],
      p_evidence_images: ["evidence"],
      p_paid_at: "2026-07-31T00:00:00+00:00",
      p_payment_id: id,
      p_payment_method: "bank_transfer",
      p_payment_reference: "reference",
      p_remark: "remark",
    };

    expect(save.p_allocations).toEqual([
      { payable_event_id: id, requested_amount: "100.00" },
    ]);
    expect(submit.p_expected_version).toBe(1);
    expect(review.p_action).toBe("approve");
    expect(cancel.p_reason).toBe("cancelled");
    expect(close.p_reason).toBe("closed");
    expect(confirm.p_payment_id).toBe(id);
  });
});

void (0 as unknown as PayableDueContract);
void (0 as unknown as PaymentEvidenceContract);
void (0 as unknown as PayableListReturnContract);
