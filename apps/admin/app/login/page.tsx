import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getAdminSession } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getAdminSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="console-grid min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 px-5 py-8 lg:grid-cols-[1fr_430px] lg:items-center lg:gap-14">
        <section className="hidden max-w-2xl lg:flex lg:flex-col lg:items-start">
          <div className="mb-12 flex size-[156px] items-center justify-center overflow-hidden rounded-full border-[6px] border-[#f3b400] bg-white shadow-[0_18px_42px_rgba(33,24,0,0.18)]">
            <img src="/logo.png" alt="鹅班长" className="size-[136px] object-contain" />
          </div>
          <h1 className="text-[42px] font-extrabold leading-tight tracking-normal text-[#141414] [text-shadow:0_4px_0_rgba(243,180,0,0.32)]">
            鹅班长AI助力装修
          </h1>
          <p className="mt-4 text-sm font-semibold tracking-[0.42em] text-[#4d3b00]">
            让装修更省心 更透明
          </p>
          <p className="mt-8 max-w-xl text-base leading-8 text-[#4d3b00]">
            客户、项目、费用审批和工地监控集中管理，后台入口仅面向已绑定员工档案的成员。
          </p>
          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
            {["权限受控", "审批可追踪", "项目可扫描"].map((item) => (
              <div key={item} className="rounded-lg border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-[#141414] shadow-[0_12px_30px_rgba(17,17,17,0.08)]">
                {item}
              </div>
            ))}
          </div>
        </section>
        <section className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center gap-7 lg:min-h-0">
          <div className="flex flex-col items-center lg:hidden">
            <div className="flex size-[118px] items-center justify-center overflow-hidden rounded-full border-[5px] border-[#f3b400] bg-white shadow-[0_18px_42px_rgba(33,24,0,0.18)]">
              <img src="/logo.png" alt="鹅班长" className="size-[102px] object-contain" />
            </div>
            <h1 className="mt-5 text-center text-3xl font-extrabold leading-tight tracking-normal text-[#141414] [text-shadow:0_3px_0_rgba(243,180,0,0.32)]">
              鹅班长AI助力装修
            </h1>
            <p className="mt-3 text-center text-xs font-semibold tracking-[0.36em] text-[#4d3b00]">
              让装修更省心 更透明
            </p>
          </div>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
