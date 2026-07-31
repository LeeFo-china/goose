const root = `${import.meta.dir}/dist`;
const port = Number(process.env.PORT || 3020);
const revision = process.env.GOOES_BUILD_SHA || "unknown";

function getResponseHeaders(contentType: string) {
  return {
    "content-type": contentType,
    "x-gooes-revision": revision,
    "x-gooes-service": "h5",
  };
}

function getContentType(pathname: string) {
  if (pathname.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  return "text/html; charset=utf-8";
}

async function readStatic(pathname: string) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const filePath = `${root}${normalized}`;
  const file = Bun.file(filePath);

  if (await file.exists()) {
    return new Response(file, {
      headers: getResponseHeaders(getContentType(normalized)),
    });
  }

  return new Response(Bun.file(`${root}/index.html`), {
    headers: getResponseHeaders("text/html; charset=utf-8"),
  });
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    return readStatic(url.pathname);
  },
});

console.log(`H5 dev server running at http://localhost:${port}`);
