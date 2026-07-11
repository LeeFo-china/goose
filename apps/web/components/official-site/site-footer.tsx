import Link from "next/link";

import { Separator } from "@/components/ui/separator";

const footerLinks = [
  { href: "/", label: "返回首页" },
] as const;

export function SiteFooter(): React.JSX.Element {
  return (
    <footer className="bg-background">
      <Separator />
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex flex-col gap-1">
          <p className="font-semibold">鹅班长</p>
          <p className="text-sm text-muted-foreground">
            为装修经营者和城市合作伙伴提供清晰、可靠的业务支持。
          </p>
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
