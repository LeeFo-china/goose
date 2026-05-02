import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getAdminSession } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getAdminSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="console-grid min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 px-5 py-10 lg:grid-cols-[1fr_460px] lg:items-center lg:gap-12">
        <section className="hidden max-w-2xl lg:block">
          <div className="mb-6 inline-flex rounded-md border bg-card px-3 py-1 text-sm text-muted-foreground">
            Gooes Admin Console
          </div>
          <h1 className="text-4xl font-semibold leading-tight tracking-normal text-slate-950">
            小笨鹅业务管理后台
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
            客户、项目、员工权限、费用审批和工地监控集中管理。后台只允许在职员工使用短信验证码登录。
          </p>
          <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
            {["权限受控", "审批可追踪", "项目可扫描"].map((item) => (
              <div key={item} className="rounded-lg border bg-card px-4 py-3 text-sm font-medium">
                {item}
              </div>
            ))}
          </div>
        </section>
        <section className="flex min-h-[calc(100vh-80px)] items-center justify-center lg:min-h-0">
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
