import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DetailInfoItem = {
  label: string;
  value: ReactNode;
};

export function DetailInfoGrid({
  items,
  columns = 4,
  className,
}: {
  items: DetailInfoItem[];
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const columnClassName = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-4",
  }[columns];

  return (
    <div className={cn("grid gap-3", columnClassName, className)}>
      {items.map((item) => (
        <div key={item.label} className="rounded-md border bg-background p-3">
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className="mt-1 min-w-0 truncate text-sm font-medium">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
