export interface SiteNavigationItem {
  readonly href: string;
  readonly label: string;
  readonly mobileLabel?: string;
}

export const SITE_NAVIGATION: readonly SiteNavigationItem[] = [
  { href: "/", label: "首页", mobileLabel: "返回首页" },
  { href: "/products", label: "产品" },
  { href: "/solutions", label: "解决方案" },
  { href: "/cases", label: "案例" },
  { href: "/partners", label: "城市合伙人" },
  { href: "/about", label: "关于我们" },
];

export function isSiteNavigationActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
