import Link from "next/link";
import type { SiteContentPublicList } from "@gooes/domain";

import { ContentCard } from "@/components/content/content-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ContentListProps {
  readonly data: SiteContentPublicList;
  readonly title: string;
  readonly description: string;
  readonly basePath: "/articles" | "/cases";
}

export function ContentList({
  data,
  title,
  description,
  basePath,
}: ContentListProps): React.JSX.Element {
  const { page, total, totalPages } = data.pagination;
  const firstCoverIndex = data.list.findIndex((item) => Boolean(item.cover));

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
      <header className="flex max-w-3xl flex-col gap-4">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        <p className="text-pretty text-lg leading-8 text-muted-foreground">
          {description}
        </p>
      </header>

      {data.list.length > 0 ? (
        <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-14 md:grid-cols-2 lg:mt-16">
          {data.list.map((item, index) => (
            <ContentCard
              content={item}
              key={item.id}
              priority={index === firstCoverIndex}
            />
          ))}
        </div>
      ) : (
        <Alert className="mt-12">
          <AlertTitle>暂时没有已发布内容</AlertTitle>
          <AlertDescription>
            <p>内容发布后会显示在这里，请稍后再来查看。</p>
          </AlertDescription>
        </Alert>
      )}

      {totalPages > 0 ? (
        <nav
          aria-label={`${title}分页`}
          className="mt-14 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm tabular-nums text-muted-foreground">
            第 {page} / {totalPages} 页，共 {total} 条
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button asChild variant="outline">
                <Link href={`${basePath}?page=${page - 1}`}>查看上一页</Link>
              </Button>
            ) : (
              <Button disabled variant="outline">查看上一页</Button>
            )}
            {page < totalPages ? (
              <Button asChild variant="outline">
                <Link href={`${basePath}?page=${page + 1}`}>查看下一页</Link>
              </Button>
            ) : (
              <Button disabled variant="outline">查看下一页</Button>
            )}
          </div>
        </nav>
      ) : null}
    </section>
  );
}
