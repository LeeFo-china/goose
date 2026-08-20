import Image from "next/image";
import Link from "next/link";

import { DesktopNavigation } from "@/components/official-site/desktop-navigation";
import { MobileNavigation } from "@/components/official-site/mobile-navigation";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader(): React.JSX.Element {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          className="flex shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/"
        >
          <Image alt="好店智装云" height={32} priority src="/logo.png" width={32} />
          <span aria-hidden="true">好店智装云</span>
        </Link>

        <DesktopNavigation />

        <div className="ml-auto flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <MobileNavigation />
        </div>
      </div>
    </header>
  );
}
