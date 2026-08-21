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
    <main className="console-grid min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 px-5 py-8 lg:grid-cols-[1fr_430px] lg:items-center lg:gap-14">
        <section className="hidden max-w-2xl lg:flex lg:flex-col lg:items-start">
          <div className="mb-10 w-[240px] overflow-hidden rounded-lg border bg-card p-3 shadow-sm">
            <Image
              src="/logo.png"
              alt="好店智装云"
              width={1254}
              height={1254}
              sizes="240px"
              className="h-auto w-full object-contain"
            />
          </div>
          <h1 className="text-[42px] font-extrabold leading-tight tracking-normal text-foreground">
            AI 助力装修管理
          </h1>
          <p className="mt-4 text-sm font-semibold tracking-[0.42em] text-secondary-foreground">
            让装修更省心 更透明
          </p>
          <p className="mt-8 max-w-xl text-base leading-8 text-muted-foreground">
            客户、项目、费用审批和工地监控集中管理，后台入口仅面向已绑定员工档案的成员。
          </p>
          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
            {["权限受控", "审批可追踪", "项目可扫描"].map((item) => (
              <div key={item} className="rounded-lg border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-sm">
                {item}
              </div>
            ))}
          </div>
        </section>
        <section className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center gap-7 lg:min-h-0">
          <div className="flex flex-col items-center lg:hidden">
            <div className="w-[180px] overflow-hidden rounded-lg border bg-card p-2 shadow-sm">
              <Image
                src="/logo.png"
                alt="好店智装云"
                width={1254}
                height={1254}
                sizes="180px"
                className="h-auto w-full object-contain"
              />
            </div>
            <h1 className="mt-5 text-center text-3xl font-extrabold leading-tight tracking-normal text-foreground">
              AI 助力装修管理
            </h1>
            <p className="mt-3 text-center text-xs font-semibold tracking-[0.36em] text-secondary-foreground">
              让装修更省心 更透明
            </p>
          </div>
          <LoginForm sessionNotice={getAdminLoginNotice(reason)} />
        </section>
      </div>
    </main>
  );
}
