import { SiteFooter } from "@/components/official-site/site-footer";
import { SiteHeader } from "@/components/official-site/site-header";

interface SiteShellProps {
  readonly children: React.ReactNode;
}

export function SiteShell({ children }: SiteShellProps): React.JSX.Element {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
