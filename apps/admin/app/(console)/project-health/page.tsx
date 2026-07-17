import { redirect } from "next/navigation";

type ProjectHealthSearchParams = Record<string, string | string[] | undefined>;

function buildRedirectHref(params: ProjectHealthSearchParams): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }

  const queryString = query.toString();
  return queryString ? `/projects/health?${queryString}` : "/projects/health";
}

export default async function LegacyProjectHealthPage({
  searchParams,
}: {
  searchParams: Promise<ProjectHealthSearchParams>;
}) {
  redirect(buildRedirectHref(await searchParams));
}
