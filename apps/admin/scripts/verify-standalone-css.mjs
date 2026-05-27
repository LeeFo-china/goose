const baseUrl = process.env.ADMIN_BASE_URL || "http://127.0.0.1:3010";

async function fetchText(url) {
  const response = await fetch(url);
  const text = await response.text();
  return { response, text };
}

function getCssHrefs(html) {
  const hrefs = new Set();
  const pattern = /<link\b[^>]*\bhref="([^"]+\.css)"[^>]*>/g;
  let match = pattern.exec(html);
  while (match) {
    hrefs.add(match[1]);
    match = pattern.exec(html);
  }
  return [...hrefs];
}

const loginUrl = new URL("/login", baseUrl);
const { response: pageResponse, text: html } = await fetchText(loginUrl);

if (!pageResponse.ok) {
  throw new Error(`GET ${loginUrl} failed: ${pageResponse.status}`);
}

const cssHrefs = getCssHrefs(html);
if (cssHrefs.length === 0) {
  throw new Error(`GET ${loginUrl} did not include CSS links`);
}

for (const href of cssHrefs) {
  const cssUrl = new URL(href, baseUrl);
  const cssResponse = await fetch(cssUrl);
  const contentType = cssResponse.headers.get("content-type") || "";
  const css = await cssResponse.text();

  if (!cssResponse.ok) {
    throw new Error(`GET ${cssUrl} failed: ${cssResponse.status}`);
  }
  if (!contentType.includes("text/css")) {
    throw new Error(`GET ${cssUrl} returned unexpected content-type: ${contentType}`);
  }
  if (css.length < 1_000) {
    throw new Error(`GET ${cssUrl} returned suspiciously small CSS: ${css.length} bytes`);
  }

  console.log(`CSS OK ${cssUrl.pathname} ${css.length} bytes`);
}
