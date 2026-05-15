import type { ReactNode } from "react";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ListCardHeader({
  title,
  description,
  action,
  filters,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  filters?: ReactNode;
  className?: string;
}) {
  return (
    <CardHeader className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {filters}
    </CardHeader>
  );
}
