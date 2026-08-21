import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

function FieldSet({
  className,
  ...props
}: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & {
  variant?: "legend" | "label";
}) {
  return (
    <legend
      data-variant={variant}
      className={cn(
        "mb-2 font-medium",
        variant === "legend" ? "text-base" : "text-sm",
        className,
      )}
      {...props}
    />
  );
}

function FieldGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-4", className)} {...props} />;
}

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  orientation?: "vertical" | "horizontal";
}) {
  return (
    <div
      data-orientation={orientation}
      className={cn(
        "flex flex-col gap-2 data-[invalid=true]:[&_input]:border-destructive data-[invalid=true]:[&_textarea]:border-destructive data-[invalid=true]:[&_button[role=combobox]]:border-destructive data-[invalid=true]:[&_select]:border-destructive",
        orientation === "horizontal" && "flex-row items-center",
        className,
      )}
      {...props}
    />
  );
}

const FieldLabel = Label;

function FieldDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-xs leading-5 text-muted-foreground", className)}
      {...props}
    />
  );
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & {
  errors?: Array<{ message?: string } | undefined>;
}) {
  const message = children || errors?.find((error) => error?.message)?.message;
  if (!message) return null;

  return (
    <p className={cn("text-xs font-medium text-destructive", className)} {...props}>
      {message}
    </p>
  );
}

export {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
};
