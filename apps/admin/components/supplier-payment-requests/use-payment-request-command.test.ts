import { afterEach, expect, mock, test } from "bun:test";

type Cell =
  | { kind: "ref"; value: { current: unknown } }
  | { kind: "state"; value: unknown }
  | { kind: "effect"; deps: unknown[]; cleanup?: () => void };
type Lifecycle = { cursor: number; cells: Cell[]; effects: Array<() => void>; mounted: boolean };
let rendering: Lifecycle | null = null;
function lifecycle() {
  if (!rendering) throw new RangeError("Hook must run inside the controlled lifecycle");
  return rendering;
}

// Control React scheduling only. The hook, frozen command, HTTP sender, receipt
// parser and storage code all run unchanged in this isolated Bun test process.
mock.module("react", () => ({
  useRef<T>(initial: T) {
    const host = lifecycle();
    const index = host.cursor++;
    const cell = host.cells[index] ??= { kind: "ref", value: { current: initial } };
    if (cell.kind !== "ref") throw new RangeError("Hook order changed");
    return cell.value as { current: T };
  },
  useState<T>(initial: T | (() => T)) {
    const host = lifecycle();
    const index = host.cursor++;
    const cell = host.cells[index] ??= { kind: "state", value: typeof initial === "function" ? (initial as () => T)() : initial };
    if (cell.kind !== "state") throw new RangeError("Hook order changed");
    return [cell.value as T, (update: T | ((previous: T) => T)) => {
      if (host.mounted) cell.value = typeof update === "function" ? (update as (previous: T) => T)(cell.value as T) : update;
    }] as const;
  },
  useEffect(effect: () => void | (() => void), deps: unknown[]) {
    const host = lifecycle();
    const index = host.cursor++;
    const previous = host.cells[index];
    if (previous && previous.kind !== "effect") throw new RangeError("Hook order changed");
    if (!previous || deps.some((value, position) => !Object.is(value, previous.deps[position]))) {
      host.effects.push(() => {
        previous?.cleanup?.();
        host.cells[index] = { kind: "effect", deps: [...deps], cleanup: effect() || undefined };
      });
    }
  },
}));

const session = { storageScope: "tenant:test:user:test", tenantId: "tenant-test", userId: "user-test" };
mock.module("@/components/layout/admin-session-scope", () => ({
  ADMIN_SESSION_STORAGE_PREFIX: "gooes:admin-session:",
  useAdminSessionScope: () => session,
  clearAdminSessionScopedStorage() {},
}));
const { usePaymentRequestCommand } = await import("./use-payment-request-command");
const { initialInvoiceRequest } = await import("../../e2e/supplier-payment-mock-fixture.mjs");

function mount() {
  const host: Lifecycle = { cursor: 0, cells: [], effects: [], mounted: true };
  function render(slot: "draft" | "actions" = "actions") {
    rendering = host;
    host.cursor = 0;
    const result = usePaymentRequestCommand(slot);
    rendering = null;
    host.effects.splice(0).forEach((effect) => effect());
    return result;
  }
  render();
  return { render, unmount() {
    host.mounted = false;
    host.cells.forEach((cell) => { if (cell.kind === "effect") cell.cleanup?.(); });
  } };
}

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

for (const lateResponse of ["accepted", "uncertain"] as const) {
  for (const replacement of ["unmount", "slot-cycle"] as const) {
    test(`${replacement}: late ${lateResponse} A cannot erase or replace the current uncertain B`, async () => {
      const storage = new Map<string, string>();
      Object.defineProperty(globalThis, "window", { configurable: true, value: { sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); },
        removeItem: (key: string) => { storage.delete(key); },
      } } });
      const request = { ...initialInvoiceRequest().payment_request, status: "draft", version: 2,
        submitted_by_employee_id: null, submitted_at: null,
        reviewed_by_employee_id: null, reviewed_at: null, review_remark: null };
      const receipt = { status: "submitted", idempotent: false, version: 3,
        payment_request: { ...request, status: "pending_approval", version: 3 } };
      let resolveOld: (value: Response) => void = () => {};
      const oldResponse = new Promise<Response>((resolve) => { resolveOld = resolve; });
      let calls = 0;
      globalThis.fetch = Object.assign(async () => {
        calls += 1;
        if (calls === 1) return oldResponse;
        if (calls === 2) return Response.json({ success: true, data: { ...receipt, idempotent: true } });
        return new Response('{"success":true,"data":', { status: 200 });
      }, { preconnect: originalFetch.preconnect });
      const old = mount();
      const pendingOld = old.render().execute("submit", request.id, { expected_version: 2 }, request);
      let current = old;
      if (replacement === "unmount") { old.unmount(); current = mount(); }
      else { old.render("draft"); old.render("actions"); }
      expect((await current.render().retry())?.type).toBe("accepted");
      const requestB = { ...request, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", request_no: "PAYREQ-E2E-B" };
      expect((await current.render().execute("submit", requestB.id, { expected_version: 2 }, requestB))?.type).toBe("uncertain");
      const savedBefore = [...storage.entries()];
      const frozenB = current.render().pending;
      expect(frozenB?.command.resourcePath).toBe(requestB.id);
      resolveOld(lateResponse === "accepted" ? Response.json({ success: true, data: receipt })
        : new Response('{"success":true,"data":', { status: 200 }));
      const late = await pendingOld;
      expect([...storage.entries()]).toEqual(savedBefore);
      expect(late).toBeNull();
      expect(current.render().pending).toEqual(frozenB);
      current.unmount();
      const restored = mount();
      expect(restored.render().pending).toEqual(frozenB);
      expect(calls).toBe(3);
      restored.unmount();
    });
  }
}
