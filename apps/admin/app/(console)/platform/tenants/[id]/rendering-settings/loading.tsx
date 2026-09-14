import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
    <Spinner className="mr-2" />正在加载客户生图额度…
  </div>;
}
