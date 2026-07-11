const [contentPath = ""] = process.argv.slice(2);
const match = /^\/(?:articles|cases|cities)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(
  contentPath,
);

if (!match || (match[1]?.length ?? 0) > 200) {
  console.error(
    "Invalid Web smoke content path: use a published article, case, or city slug of at most 200 characters.",
  );
  process.exit(1);
}
