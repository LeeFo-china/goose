import { beforeEach, describe, expect, mock, test } from "bun:test";

const ticketRow = {
  id: "ticket-1",
  tenant_id: "tenant-1",
  ticket: "ticket-token-123456",
  acceptance_id: "acceptance-1",
  project_id: "project-1",
  customer_id: "customer-1",
  phone: "13200001004",
  scene: "project_acceptance_customer_review",
  status: "active",
  link_type: null,
  link_url: null,
  send_status: null,
  send_error: null,
  sent_at: null,
  expire_at: "2099-01-01T00:00:00.000Z",
  used_at: null,
  last_verified_at: null,
  verify_count: 0,
  created_by: null,
  created_at: "2026-06-22T00:00:00.000Z",
  updated_at: "2026-06-22T00:00:00.000Z",
};

const confirmedAcceptanceRow = {
  id: "acceptance-1",
  tenant_id: "tenant-1",
  project_id: "project-1",
  customer_id: "customer-1",
  stage_code: "plumbing_electrical",
  status: "customer_confirmed",
};

const findByTicket = mock(async () => ticketRow);
const update = mock(async () => ({
  ...ticketRow,
  used_at: "2026-06-22T00:10:00.000Z",
  last_verified_at: "2026-06-22T00:10:00.000Z",
  verify_count: 1,
}));
const getAcceptanceById = mock(async () => confirmedAcceptanceRow);

mock.module("@/repositories/project-acceptance-open-tickets", () => ({
  projectAcceptanceOpenTicketRepository: {
    findByTicket,
    update,
  },
}));

mock.module("@/repositories/project-acceptances", () => ({
  projectAcceptanceRepository: {
    getAcceptanceById,
  },
}));

describe("verifyOpenTicketRow", () => {
  beforeEach(() => {
    findByTicket.mockClear();
    findByTicket.mockImplementation(async () => ticketRow);
    update.mockClear();
    update.mockImplementation(async () => ({
      ...ticketRow,
      used_at: "2026-06-22T00:10:00.000Z",
      last_verified_at: "2026-06-22T00:10:00.000Z",
      verify_count: 1,
    }));
    getAcceptanceById.mockClear();
    getAcceptanceById.mockImplementation(async () => confirmedAcceptanceRow);
  });

  test("accepts active ticket for already confirmed acceptance to allow workflow resync", async () => {
    const { verifyOpenTicketRow } = await import("./notifications");
    const serviceContext = {
      assertTenantAvailableById: mock(async () => undefined),
    };

    const result = await verifyOpenTicketRow.call(serviceContext, {
      ticket: ticketRow.ticket,
      acceptance_id: ticketRow.acceptance_id,
      project_id: ticketRow.project_id,
    });

    expect(result.valid).toBe(true);
    expect(update).toHaveBeenCalledWith(
      ticketRow.id,
      expect.objectContaining({
        used_at: expect.any(String),
        last_verified_at: expect.any(String),
        verify_count: 1,
      }),
      ticketRow.tenant_id,
    );
  });
});
