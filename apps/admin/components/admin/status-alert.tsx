import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function StatusAlert({
  tone = "error",
  title,
  children,
}: {
  tone?: "error" | "success" | "warning";
  title?: string;
  children: React.ReactNode;
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <Alert variant={tone === "error" ? "destructive" : "default"}>
      <Icon className="size-4" />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
