import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ProjectsLoading() {
  return (
    <div className="space-y-5">
      <div className="flex justify-between gap-3">
        <div>
          <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
          <div className="mt-2 h-4 w-96 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="h-10 w-10 animate-pulse rounded-md bg-muted" />
              <div className="space-y-2">
                <div className="h-4 w-24 animate-pulse rounded-md bg-muted" />
                <div className="h-6 w-28 animate-pulse rounded-md bg-muted" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-[150px_150px_1fr_72px]">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="h-5 w-24 animate-pulse rounded-md bg-muted" />
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
