export function getIdentityCopyMeta({
  id,
  name,
  fallbackName,
}: {
  id: string;
  name: string | null | undefined;
  fallbackName: string;
}) {
  const trimmedName = name?.trim();

  return {
    id,
    name: trimmedName || fallbackName,
  };
}
