import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function TenantMaterialNotesLoading() {
  return <div className="flex flex-col gap-5" aria-label="正在加载资料列表">
    <div className="flex flex-col gap-2"><Skeleton className="h-7 w-32" /><Skeleton className="h-5 w-96 max-w-full" /></div>
    <Card className="shadow-none">
      <CardHeader className="flex flex-row gap-3 border-b"><Skeleton className="h-9 w-44" /><Skeleton className="h-9 flex-1" /></CardHeader>
      <CardContent className="flex flex-col gap-3 p-4">
        <Skeleton className="h-10 w-full" /><Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" />
      </CardContent>
    </Card>
  </div>;
}
