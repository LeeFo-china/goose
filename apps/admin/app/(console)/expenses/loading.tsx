import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ExpensesLoading() {
  return (
    <div className="space-y-5">
      <div>
        <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="h-10 w-10 animate-pulse rounded-md bg-muted" />
              <div className="space-y-2">
                <div className="h-4 w-20 animate-pulse rounded-md bg-muted" />
                <div className="h-6 w-28 animate-pulse rounded-md bg-muted" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 xl:grid-cols-[140px_140px_160px_1fr_72px]">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="h-5 w-28 animate-pulse rounded-md bg-muted" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
