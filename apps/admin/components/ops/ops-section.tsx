import type { ReactNode } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function OpsSection({
  title,
  description,
  icon,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-normal">
            {icon ? (
              <span className="inline-flex shrink-0 items-center text-muted-foreground [&_svg]:size-4">
                {icon}
              </span>
            ) : null}
            <span className="min-w-0 truncate">{title}</span>
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <Separator />
      <div className={cn("flex flex-col gap-4", contentClassName)}>
        {children}
      </div>
    </section>
  );
}

export function OpsEmptyState({
  title,
  description,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("min-h-28 rounded-md bg-muted/20 p-6 md:p-8", className)}>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
  );
}
