import Link from "next/link";

import { Separator } from "@/components/ui/separator";

const footerLinks = [
  { href: "/", label: "返回首页" },
  { href: "/products", label: "产品" },
  { href: "/solutions", label: "解决方案" },
  { href: "/cases", label: "案例" },
  { href: "/partners", label: "城市合伙人" },
  { href: "/about", label: "关于我们" },
] as const;

export function SiteFooter(): React.JSX.Element {
  return (
    <footer className="bg-background">
      <Separator />
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex flex-col gap-1">
          <p className="font-semibold">好店智装云</p>
          <p className="text-sm text-muted-foreground">
            为装修经营者和城市合作伙伴提供清晰、可靠的业务支持。
          </p>
          <a
            className="w-fit rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            href="https://beian.miit.gov.cn/"
            rel="noopener noreferrer"
            target="_blank"
          >
            豫ICP备19043554号-1
          </a>
        </div>
        <nav aria-label="页脚导航" className="flex flex-wrap gap-x-5 gap-y-2">
          {footerLinks.map((item) => (
            <Link
              className="rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
