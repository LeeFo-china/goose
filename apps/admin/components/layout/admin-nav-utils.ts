export function isActivePath(
  pathname: string,
  href: string,
  options: { exact?: boolean; activeHrefs?: readonly string[] } = {},
) {
  const hrefs = [href, ...(options.activeHrefs ?? [])];
  if (options.exact) return hrefs.includes(pathname);
  return hrefs.some(
    (candidate) =>
      pathname === candidate || pathname.startsWith(`${candidate}/`),
  );
}
