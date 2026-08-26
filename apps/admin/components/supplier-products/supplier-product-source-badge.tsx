import { Badge } from "@/components/ui/badge";
import type { SupplierProductSource } from "./supplier-product-types";

export function SupplierProductSourceBadge({
  source,
}: {
  source: SupplierProductSource;
}) {
  return source === "platform_shared" ? (
    <Badge variant="outline">平台共享</Badge>
  ) : (
    <Badge variant="secondary">私有</Badge>
  );
}
