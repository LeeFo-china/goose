import Image from "next/image";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getAdminLoginNotice } from "@/components/login-form-navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getAdminSession } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const session = await getAdminSession();
  if (session) {
    redirect("/dashboard");
  }
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : undefined;

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-background px-5 py-8">
      <div className="pointer-events-none absolute left-1/2 top-16 h-56 w-[min(48rem,86vw)] -translate-x-1/2 rounded-[48%] bg-primary/5 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-40 h-48 w-[min(34rem,72vw)] -translate-x-1/2 rounded-[44%] bg-primary/5 blur-2xl" />
      <div className="relative mx-auto flex min-h-[calc(100dvh-64px)] w-full max-w-[500px] items-start pt-[12vh] sm:pt-[14vh]">
        <Card className="w-full border-border/70 bg-card/95 shadow-[0_18px_48px_rgba(12,47,69,0.10)]">
          <CardHeader className="items-center gap-3 px-10 pb-5 pt-10 text-center">
            <div className="w-[76px] overflow-hidden rounded-md bg-card p-1">
              <Image
                src="/logo.png"
                alt="好店智装云"
                width={1254}
                height={1254}
                sizes="76px"
                priority
                className="h-auto w-full object-contain"
              />
            </div>
            <div className="flex flex-col gap-1">
              <CardTitle className="text-xl font-semibold leading-tight text-foreground">
                好店智装云
              </CardTitle>
              <p className="text-sm text-muted-foreground">员工管理后台</p>
            </div>
          </CardHeader>
          <CardContent className="px-10 pb-10 pt-0 max-[420px]:px-7">
            <Separator className="mb-7" />
            <LoginForm sessionNotice={getAdminLoginNotice(reason)} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
