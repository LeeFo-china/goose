import "reflect-metadata";
import Fastify from "fastify";
import AutoLoad from "@fastify/autoload";
import multipart from "@fastify/multipart";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import errorHandler from "@/plugins/error-handler";
import authPlugin from "@/plugins/auth";
import { signToken } from "@/utils/jwt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = dirname(__dirname);

type VerifyResult = {
  step: string;
  ok: boolean;
  detail: string;
};

const results: VerifyResult[] = [];

function pushResult(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
}

function getJson<T>(payload: string) {
  return JSON.parse(payload) as T;
}

async function main() {
  const app = Fastify({ logger: false });
  app.register(multipart, {
    limits: {
      files: 9,
      fileSize: 10 * 1024 * 1024,
    },
  });
  app.register(errorHandler);
  authPlugin(app);
  app.register(AutoLoad, {
    dir: join(appRoot, "routes"),
  });

  await app.ready();

  const token = signToken({
    sub: "debug-user",
    openid: "debug-openid",
    roles: ["admin"],
  });

  const headers = {
    authorization: `Bearer ${token}`,
  };

  try {
    const byName = await app.inject({
      method: "GET",
      url: "/projects/create/customers?page=1&pageSize=10&keyword=%E5%A4%A7%E5%B1%B1",
      headers,
    });
    const byNameJson = getJson<{
      data: { list: Array<{ id: string; name: string | null; phone: string | null }>; pagination: { total: number } };
      message: string;
    }>(byName.payload);
    const hasNameHit = byNameJson.data.list.some((item) =>
      item.name?.includes("大山")
    );
    pushResult(
      "search by customer name",
      byName.statusCode === 200 && hasNameHit,
      `statusCode=${byName.statusCode}, total=${byNameJson.data.pagination.total}, firstNames=${byNameJson.data.list.map((item) => item.name).join(",")}`,
    );

    const byPhone = await app.inject({
      method: "GET",
      url: "/projects/create/customers?page=1&pageSize=10&keyword=18637605353",
      headers,
    });
    const byPhoneJson = getJson<{
      data: { list: Array<{ id: string; name: string | null; phone: string | null }>; pagination: { total: number } };
      message: string;
    }>(byPhone.payload);
    const hasPhoneHit = byPhoneJson.data.list.some((item) =>
      item.phone?.includes("18637605353")
    );
    pushResult(
      "search by customer phone",
      byPhone.statusCode === 200 && hasPhoneHit,
      `statusCode=${byPhone.statusCode}, total=${byPhoneJson.data.pagination.total}, phones=${byPhoneJson.data.list.map((item) => item.phone).join(",")}`,
    );

    const noKeyword = await app.inject({
      method: "GET",
      url: "/projects/create/customers?page=1&pageSize=10",
      headers,
    });
    const noKeywordJson = getJson<{
      data: { list: Array<{ id: string; name: string | null; phone: string | null }>; pagination: { total: number; page: number; pageSize: number } };
      message: string;
    }>(noKeyword.payload);
    pushResult(
      "list customers without keyword",
      noKeyword.statusCode === 200
        && noKeywordJson.data.pagination.page === 1
        && noKeywordJson.data.pagination.pageSize === 10
        && noKeywordJson.data.list.length > 0,
      `statusCode=${noKeyword.statusCode}, total=${noKeywordJson.data.pagination.total}, list_length=${noKeywordJson.data.list.length}`,
    );
  } finally {
    await app.close();
  }

  for (const result of results) {
    console.log(
      `${result.ok ? "PASS" : "FAIL"} | ${result.step} | ${result.detail}`,
    );
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
