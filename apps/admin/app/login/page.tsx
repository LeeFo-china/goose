import Image from "next/image";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getAdminLoginNotice } from "@/components/login-form-navigation";
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
    <main className="console-grid min-h-[100dvh] px-5 py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-64px)] w-full max-w-[420px] flex-col justify-center gap-5">
        <section className="flex flex-col items-center gap-3 text-center">
          <div className="w-[112px] overflow-hidden rounded-md bg-card p-1">
            <Image
              src="/logo.png"
              alt="好店智装云"
              width={1254}
              height={1254}
              sizes="112px"
              priority
              className="h-auto w-full object-contain"
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold leading-tight text-foreground">
              好店智装云
            </h1>
            <p className="text-sm text-muted-foreground">
              员工管理后台
            </p>
          </div>
        </section>
        <LoginForm sessionNotice={getAdminLoginNotice(reason)} />
      </div>
    </main>
  );
}
