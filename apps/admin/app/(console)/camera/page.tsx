import { redirect } from "next/navigation";

type CameraSearchParams = Record<string, string | string[] | undefined>;

function buildRedirectHref(params: CameraSearchParams): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }

  const queryString = query.toString();
  return queryString ? `/cameras?${queryString}` : "/cameras";
}

export default async function LegacyCameraPage({
  searchParams,
}: {
  searchParams: Promise<CameraSearchParams>;
}) {
  redirect(buildRedirectHref(await searchParams));
}
