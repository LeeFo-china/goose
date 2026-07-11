import { createServer } from "node:http";

createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      success: true,
      upstream_headers: request.headers,
      upstream_path: request.url,
      body: Buffer.concat(chunks).toString("utf8"),
    }));
  });
}).listen(3900, "127.0.0.1");
