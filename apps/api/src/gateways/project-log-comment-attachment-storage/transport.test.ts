import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";
import { ProjectLogCommentAttachmentStorage } from "./client";

// Real installed SDK transport against a local COS-shaped server. No cloud credentials or cloud I/O.
test("installed COS SDK streams conditional reads and sends private frozen bytes over HTTP", async () => {
  const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: "red" } }).webp().toBuffer();
  const hash = createHash("sha256").update(bytes).digest("hex");
  const requests: Array<{ method: string; path: string; acl?: string; match?: string; hash?: string }> = [];
  let stored: Buffer | undefined;
  const server = createServer((req, res) => {
    requests.push({ method: req.method ?? "", path: req.url ?? "", acl: req.headers["x-cos-acl"] as string | undefined,
      match: req.headers["if-match"], hash: req.headers["x-cos-meta-sha256"] as string | undefined });
    if (req.method === "HEAD") { res.writeHead(200, { "Content-Length": bytes.length, "Content-Type": "image/webp", ETag: '"raw"' }); res.end(); }
    else if (req.method === "GET") { res.writeHead(206, { "Content-Length": bytes.length, "Content-Type": "image/webp", ETag: '"raw"' }); res.end(bytes); }
    else if (req.method === "PUT") {
      const chunks: Buffer[] = []; req.on("data", chunk => chunks.push(Buffer.from(chunk)));
      req.on("end", () => { stored = Buffer.concat(chunks); res.writeHead(200, { ETag: '"frozen"' }); res.end(); });
    } else { res.writeHead(405); res.end(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing local server address");
  const config = { bucket: "comments-123456", region: "ap-guangzhou", secretId: "test-id", secretKey: "test-key" };
  const storage = new ProjectLogCommentAttachmentStorage({ loadConfig: async () => config,
    createCos: options => new COS({ ...options, Protocol: "http:", Domain: `127.0.0.1:${address.port}` }) });
  try {
    const location = await storage.allocate({ tenantId: "11111111-1111-4111-8111-111111111111", logId: "22222222-2222-4222-8222-222222222222", uploadId: "33333333-3333-4333-8333-333333333333" });
    const result = await storage.finalize({ ...location, mimeType: "image/webp", sizeBytes: bytes.length });
    expect(stored).toEqual(bytes);
    expect(result).toMatchObject({ checksum: hash, width: 12, height: 8, mimeType: "image/webp" });
    expect(requests).toEqual([
      { method: "HEAD", path: `/${location.rawObjectKey}`, acl: undefined, match: undefined, hash: undefined },
      { method: "GET", path: `/${location.rawObjectKey}`, acl: undefined, match: '"raw"', hash: undefined },
      { method: "PUT", path: `/${location.objectKey}/${hash}`, acl: "private", match: undefined, hash },
    ]);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
