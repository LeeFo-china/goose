import { Skeleton } from "@/components/ui/skeleton";

export default function SiteContentLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4" aria-label="正在加载官网内容">
      <div className="flex items-end justify-between gap-4 border-b pb-4">
        <div className="flex flex-col gap-2"><Skeleton className="h-5 w-28" /><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-72" /></div>
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-28 w-full md:col-span-2" /></div>
      <Skeleton className="min-h-52 flex-1" />
    </div>
  );
}
