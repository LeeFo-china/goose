import { Skeleton } from "@/components/ui/skeleton";

export default function PlatformDouyinMiniappsLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-56 max-w-4xl rounded-lg" />
    </div>
  );
}
