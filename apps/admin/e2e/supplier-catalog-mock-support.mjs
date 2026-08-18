export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

export function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function matchesKeyword(record, keyword) {
  if (!keyword) return true;
  const normalized = keyword.trim().toLocaleLowerCase("zh-CN");
  return [record.code, record.name, record.full_name, record.legal_name, record.symbol]
    .filter((value) => typeof value === "string")
    .some((value) => value.toLocaleLowerCase("zh-CN").includes(normalized));
}

export function paginate(records, url) {
  const page = positiveInteger(url.searchParams.get("page"), 1);
  const pageSize = Math.min(
    positiveInteger(url.searchParams.get("pageSize"), 20),
    100,
  );
  const keyword = url.searchParams.get("keyword") || "";
  const status = url.searchParams.get("status");
  const filtered = records.filter((record) =>
    matchesKeyword(record, keyword) && (!status || record.status === status)
  ).sort((left, right) =>
    left.sort_order - right.sort_order || left.id.localeCompare(right.id)
  );
  const start = (page - 1) * pageSize;
  return {
    list: filtered.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      total: filtered.length,
      totalPages: filtered.length ? Math.ceil(filtered.length / pageSize) : 0,
    },
  };
}
