import type { ReactNode } from "react";

export function ProcurementWorkbenchLayout({
  title,
  context,
  alerts,
  catalog,
  selection,
  footer,
}: {
  title: string;
  context: ReactNode;
  alerts?: ReactNode;
  catalog: ReactNode;
  selection: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {alerts ? <div className="shrink-0">{alerts}</div> : null}
      <div className="shrink-0 border-b bg-muted/20 px-5 py-3">
        {context}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1.7fr)_minmax(22rem,1fr)] lg:overflow-hidden">
        <section
          aria-label="可采购商品"
          className="min-w-0 border-b lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r"
        >
          {catalog}
        </section>
        <section
          aria-label="已选商品"
          className="min-w-0 lg:min-h-0 lg:overflow-y-auto"
        >
          {selection}
        </section>
      </div>
      <div className="shrink-0 border-t bg-background px-5 py-3">
        {footer}
      </div>
    </div>
  );
}
