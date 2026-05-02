import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children || (
        <Card>
          <CardHeader>
            <CardTitle>待接入</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            页面结构已经预留，后续按对应后端列表、筛选和表单接口接入。
          </CardContent>
        </Card>
      )}
    </div>
  );
}
