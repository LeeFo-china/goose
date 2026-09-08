import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";

/** Actual PostgREST transport, confined to the existing disposable DB namespace. */
export async function runWarehouseMaterialHttpSmoke(databaseContainer: string, fixture: string): Promise<void> {
  assert.match(databaseContainer, /^gooes-stage-b-database-[0-9a-f-]{36}$/);
  const container = `gooes-material-rest-${randomUUID()}`;
  const secret = randomUUID() + randomUUID();
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 600 })}`;
  const token = `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
  const docker = (args: string[], input?: string) => execFileSync("docker", args, {
    input, encoding: "utf8", timeout: 15_000, maxBuffer: 2 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  let launched = false;
  let gateway: ReturnType<typeof Bun.serve> | undefined;
  try {
    docker(["run", "--rm", "--detach", "--name", container, "--network", `container:${databaseContainer}`,
      "--env", "PGRST_DB_URI=postgresql://postgres@127.0.0.1:5432/postgres",
      "--env", "PGRST_DB_SCHEMAS=public", "--env", "PGRST_DB_ANON_ROLE=anon",
      "--env", "PGRST_DB_CONFIG=false", "--env", `PGRST_JWT_SECRET=${secret}`,
      "public.ecr.aws/supabase/postgrest:v14.10"]);
    launched = true;
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const status = docker(["exec", databaseContainer, "curl", "--silent", "--show-error", "--max-time", "1",
          "--output", "/dev/null", "--write-out", "%{http_code}", "http://127.0.0.1:3000/"]);
        if (status === "200") { ready = true; break; }
      } catch { /* Readiness only; deadline below makes connection failure fatal. */ }
      await Bun.sleep(100);
    }
    assert.ok(ready, "Isolated PostgREST did not become ready");
    gateway = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      const path = new URL(request.url).pathname;
      // This gateway cannot forward arbitrary requests or any real credentials.
      if (request.method !== "POST" || request.headers.get("authorization") !== `Bearer ${token}` ||
        !/^\/rest\/v1\/rpc\/(command_warehouse_material_order|get_warehouse_material_order|get_warehouse_material_settings|list_warehouse_material_orders|list_warehouse_material_order_items|list_warehouse_material_projects|list_inventory_transactions)$/.test(path)) {
        return Response.json({ message: "Isolated RPC transport rejected request" }, { status: 403 });
      }
      const output = docker(["exec", "-i", databaseContainer, "curl", "--silent", "--show-error", "--max-time", "8",
        "--request", "POST", "--header", "Content-Type: application/json", "--header", `Authorization: Bearer ${token}`,
        "--data-binary", "@-", "--write-out", "\n%{http_code}", `http://127.0.0.1:3000${path.slice("/rest/v1".length)}`],
      await request.text());
      const separator = output.lastIndexOf("\n");
      const status = Number(output.slice(separator + 1));
      assert.ok(separator >= 0 && status >= 200 && status <= 599, "Invalid isolated HTTP response");
      return new Response(output.slice(0, separator), { status, headers: { "content-type": "application/json" } });
    } });
    const child = Bun.spawn(["bun", "--env-file=/dev/null", "src/scripts/warehouse-material-local-api-smoke.ts"], {
      cwd: "apps/api", stdout: "pipe", stderr: "pipe", env: {
        PATH: process.env.PATH, SUPABASE_URL: `http://127.0.0.1:${gateway.port}`,
        SUPABASE_PUBLISH: token, SUPABASE_SERVICE_ROLE_KEY: token,
        WAREHOUSE_MATERIAL_ISOLATED_FIXTURE: fixture,
      },
    });
    const deadline = setTimeout(() => child.kill(), 60_000);
    try {
      const [status, stdout, stderr] = await Promise.all([
        child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
      ]);
      assert.equal(status, 0, `Isolated API smoke failed\n${stdout}\n${stderr}`);
      console.log(stdout.trim());
    } finally { clearTimeout(deadline); }
  } finally {
    gateway?.stop(true);
    if (launched) docker(["stop", "--time", "2", container]);
  }
}
