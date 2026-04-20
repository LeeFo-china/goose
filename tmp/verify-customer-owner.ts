import "reflect-metadata";
import Fastify from "fastify";
import AutoLoad from "@fastify/autoload";
import multipart from "@fastify/multipart";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import errorHandler from "@/plugins/error-handler";
import authPlugin from "@/plugins/auth";
import { signToken } from "@/utils/jwt";
import { SupabaseDB } from "@/utils/supabase/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = dirname(__dirname);

type VerifyResult = {
  step: string;
  ok: boolean;
  detail: string;
};

const results: VerifyResult[] = [];
const createdCustomerIds: string[] = [];

function pushResult(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
}

function getJson<T>(payload: string) {
  return JSON.parse(payload) as T;
}

async function main() {
  const authUserId = process.env.VERIFY_AUTH_USER_ID;
  const employeeId = process.env.VERIFY_EMPLOYEE_ID;

  if (!authUserId || !employeeId) {
    throw new Error("缺少 VERIFY_AUTH_USER_ID 或 VERIFY_EMPLOYEE_ID");
  }

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
    sub: authUserId,
    openid: "verify-openid",
    roles: ["employee"],
  });

  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };

  const now = Date.now();
  const phone = `139${String(now).slice(-8)}`;

  try {
    const permissionsRes = await app.inject({
      method: "GET",
      url: "/auth/me/permissions",
      headers,
    });

    const permissionsJson = getJson<{
      data: {
        authUserId: string;
        employeeId: string | null;
        systemRole: string | null;
      };
    }>(permissionsRes.payload);

    pushResult(
      "auth me permissions",
      permissionsRes.statusCode === 200 &&
        permissionsJson.data.employeeId === employeeId,
      `statusCode=${permissionsRes.statusCode}, employeeId=${permissionsJson.data.employeeId}, systemRole=${permissionsJson.data.systemRole}`,
    );

    const createWithoutOwner = await app.inject({
      method: "POST",
      url: "/customers",
      headers,
      payload: JSON.stringify({
        name: `验证客户-${now}`,
        phone,
        source: "referral",
        status: "potential",
      }),
    });

    const createWithoutOwnerJson = getJson<{
      data: {
        id: string;
        owner_id: string | null;
        name: string | null;
      };
      message: string;
    }>(createWithoutOwner.payload);

    if (createWithoutOwner.statusCode === 200 && createWithoutOwnerJson.data.id) {
      createdCustomerIds.push(createWithoutOwnerJson.data.id);
    }

    pushResult(
      "create customer without owner_id",
      createWithoutOwner.statusCode === 200 &&
        createWithoutOwnerJson.data.owner_id === employeeId,
      `statusCode=${createWithoutOwner.statusCode}, owner_id=${createWithoutOwnerJson.data.owner_id}, id=${createWithoutOwnerJson.data.id}`,
    );

    const detail = await app.inject({
      method: "GET",
      url: `/customers/${createWithoutOwnerJson.data.id}/detail`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    const detailJson = getJson<{
      data: {
        id: string;
        owner_id: string | null;
        owner_name: string | null;
        owner?: { id: string; name: string | null } | null;
      };
    }>(detail.payload);

    pushResult(
      "customer detail by owner",
      detail.statusCode === 200 &&
        detailJson.data.owner_id === employeeId,
      `statusCode=${detail.statusCode}, owner_id=${detailJson.data.owner_id}, owner_name=${detailJson.data.owner_name}`,
    );

    const followUpCreate = await app.inject({
      method: "POST",
      url: `/customers/${createWithoutOwnerJson.data.id}/follow_ups`,
      headers,
      payload: JSON.stringify({
        content: "验证跟进轨迹员工信息",
      }),
    });

    const followUpCreateJson = getJson<{
      data: {
        id: string;
        employee_id: string | null;
        employee_name: string | null;
      };
    }>(followUpCreate.payload);

    pushResult(
      "create customer follow up",
      followUpCreate.statusCode === 200 &&
        followUpCreateJson.data.employee_id === employeeId,
      `statusCode=${followUpCreate.statusCode}, employee_id=${followUpCreateJson.data.employee_id}, employee_name=${followUpCreateJson.data.employee_name}`,
    );

    const followUpList = await app.inject({
      method: "GET",
      url: `/customers/${createWithoutOwnerJson.data.id}/follow_ups?page=1&pageSize=10`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    const followUpListJson = getJson<{
      data: {
        list: Array<{
          id: string;
          employee_id: string | null;
          employee_name: string | null;
        }>;
      };
    }>(followUpList.payload);

    const firstFollowUp = followUpListJson.data.list[0];
    pushResult(
      "customer follow up list employee",
      followUpList.statusCode === 200 &&
        firstFollowUp?.employee_id === employeeId &&
        Boolean(firstFollowUp?.employee_name),
      `statusCode=${followUpList.statusCode}, employee_id=${firstFollowUp?.employee_id}, employee_name=${firstFollowUp?.employee_name}`,
    );

    const createWithOwner = await app.inject({
      method: "POST",
      url: "/customers",
      headers,
      payload: JSON.stringify({
        name: `验证客户-owner-${now}`,
        phone: `138${String(now).slice(-8)}`,
        source: "referral",
        status: "potential",
        owner_id: employeeId,
      }),
    });

    const createWithOwnerJson = getJson<{
      data: {
        id: string;
        owner_id: string | null;
      };
    }>(createWithOwner.payload);

    if (createWithOwner.statusCode === 200 && createWithOwnerJson.data.id) {
      createdCustomerIds.push(createWithOwnerJson.data.id);
    }

    pushResult(
      "create customer with explicit owner_id",
      createWithOwner.statusCode === 200 &&
        createWithOwnerJson.data.owner_id === employeeId,
      `statusCode=${createWithOwner.statusCode}, owner_id=${createWithOwnerJson.data.owner_id}, id=${createWithOwnerJson.data.id}`,
    );

    if (createWithoutOwnerJson.data?.id) {
      const dbCheck = await SupabaseDB.getAdminClient()
        .from("customers")
        .select("id, owner_id")
        .eq("id", createWithoutOwnerJson.data.id)
        .maybeSingle();

      pushResult(
        "db owner_id after create",
        !dbCheck.error && dbCheck.data?.owner_id === employeeId,
        `dbError=${dbCheck.error ? "yes" : "no"}, owner_id=${dbCheck.data?.owner_id ?? "null"}`,
      );
    }
  } finally {
    for (const customerId of createdCustomerIds) {
      await SupabaseDB.getAdminClient().from("customers").delete().eq("id", customerId);
    }

    await app.close();
  }

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} | ${result.step} | ${result.detail}`);
  }

  if (results.some((item) => !item.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
