export type RequisitionRequestTicket = {
  id: number;
  controller: AbortController;
};

export function createRequisitionRequestAuthority() {
  let sequence = 0;
  let current: RequisitionRequestTicket | null = null;
  return {
    begin(): RequisitionRequestTicket {
      current?.controller.abort();
      current = { id: sequence + 1, controller: new AbortController() };
      sequence = current.id;
      return current;
    },
    isCurrent(ticket: RequisitionRequestTicket) {
      return current?.id === ticket.id && !ticket.controller.signal.aborted;
    },
    invalidate() {
      current?.controller.abort();
      current = null;
      sequence += 1;
    },
  };
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
