import { afterAll, beforeAll, expect, test } from "bun:test";

const port = 41327;
const revision = "0123456789abcdef0123456789abcdef01234567";
let server: ReturnType<typeof Bun.spawn> | undefined;

beforeAll(async () => {
  const build = Bun.spawnSync(["bun", "run", "build"], {
    cwd: import.meta.dir,
    stderr: "pipe",
    stdout: "pipe",
  });
  expect(build.exitCode).toBe(0);

  server = Bun.spawn(["bun", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      GOOES_BUILD_SHA: revision,
      PORT: String(port),
    },
    stderr: "pipe",
    stdout: "pipe",
  });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/config.js`);
      if (response.ok) return;
    } catch {
      // The server process may still be starting.
    }
    await Bun.sleep(25);
  }

  throw new Error("H5 test server did not become ready");
});

afterAll(() => {
  server?.kill();
});

test("serves deep links as the versioned H5 SPA", async () => {
  const response = await fetch(
    `http://127.0.0.1:${port}/p/h5-deployment-smoke`,
  );
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get("x-gooes-service")).toBe("h5");
  expect(response.headers.get("x-gooes-revision")).toBe(revision);
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(html).toContain('<main id="app"');
});
