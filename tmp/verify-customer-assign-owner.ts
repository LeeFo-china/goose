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

  const admin = SupabaseDB.getAdminClient();

  const { data: operatorEmployee, error: operatorError } = await admin
    .from("employees")
    .select("id, name, department_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (operatorError || !operatorEmployee) {
    throw new Error("验证员工不存在");
  }

  if (!operatorEmployee.department_id) {
    throw new Error("验证员工缺少 department_id");
  }

  const { data: designManageRole, error: roleError } = await admin
    .from("roles")
    .select("id, code")
    .eq("code", "design_manage")
    .maybeSingle();

  if (roleError || !designManageRole) {
    throw new Error("缺少 design_manage 角色");
  }

  const createdIds = {
    customerId: null as string | null,
    outsideDepartmentId: null as string | null,
    outsideEmployeeId: null as string | null,
    sameDepartmentEmployeeIds: [] as string[],
  };
  let insertedDesignManageRole = false;

  const existingRoleLink = await admin
    .from("employee_roles")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("role_id", designManageRole.id)
    .maybeSingle();

  if (existingRoleLink.error) {
    throw existingRoleLink.error;
  }

  if (!existingRoleLink.data) {
    const { error: insertRoleError } = await admin.from("employee_roles").insert({
      employee_id: employeeId,
      role_id: designManageRole.id,
    });
    if (insertRoleError) {
      throw insertRoleError;
    }
    insertedDesignManageRole = true;
  }

  const { data: sameDepartmentEmployees, error: sameDepartmentError } = await admin
    .from("employees")
    .select("id, name, department_id, status")
    .eq("department_id", operatorEmployee.department_id)
    .eq("status", "active")
    .neq("id", employeeId)
    .limit(2);

  if (sameDepartmentError) {
    throw sameDepartmentError;
  }

  const sameDepartmentPool = [...(sameDepartmentEmployees || [])];
  while (sameDepartmentPool.length < 2) {
    const { data: createdEmployee, error: createEmployeeError } = await admin
      .from("employees")
      .insert({
        name: `同部门验证员工-${Date.now()}-${sameDepartmentPool.length}`,
        department_id: operatorEmployee.department_id,
        role: "employee",
        status: "active",
      })
      .select("id, name, department_id, status")
      .maybeSingle();

    if (createEmployeeError || !createdEmployee) {
      throw createEmployeeError || new Error("创建同部门验证员工失败");
    }

    sameDepartmentPool.push(createdEmployee);
    createdIds.sameDepartmentEmployeeIds.push(createdEmployee.id);
  }

  const originalOwner = sameDepartmentPool[0];
  const targetOwner = sameDepartmentPool[1];
  if (!originalOwner || !targetOwner) {
    throw new Error("缺少足够的同部门有效员工用于验证");
  }

  const { data: otherDepartment, error: otherDepartmentError } = await admin
    .from("departments")
    .select("id")
    .neq("id", operatorEmployee.department_id)
    .limit(1)
    .maybeSingle();

  if (otherDepartmentError) {
    throw otherDepartmentError;
  }

  let outsideDepartmentId = otherDepartment?.id ?? null;
  if (!outsideDepartmentId) {
    const { data: createdDepartment, error: createDepartmentError } = await admin
      .from("departments")
      .insert({
        name: `验证部门-${Date.now()}`,
        code: `VERIFY_DEPT_${Date.now()}`,
      })
      .select("id")
      .maybeSingle();

    if (createDepartmentError || !createdDepartment) {
      throw createDepartmentError || new Error("创建验证部门失败");
    }

    outsideDepartmentId = createdDepartment.id;
    createdIds.outsideDepartmentId = createdDepartment.id;
  }

  const { data: outsideEmployee, error: outsideEmployeeError } = await admin
    .from("employees")
    .insert({
      name: `外部门验证员工-${Date.now()}`,
      department_id: outsideDepartmentId,
      role: "employee",
      status: "active",
    })
    .select("id, department_id, status")
    .maybeSingle();

  if (outsideEmployeeError || !outsideEmployee) {
    throw outsideEmployeeError || new Error("创建外部门验证员工失败");
  }
  createdIds.outsideEmployeeId = outsideEmployee.id;

  const { data: createdCustomer, error: createCustomerError } = await admin
    .from("customers")
    .insert({
      name: `负责人分配验证客户-${Date.now()}`,
      phone: `137${String(Date.now()).slice(-8)}`,
      source: "referral",
      status: "potential",
      owner_id: originalOwner.id,
    })
    .select("id, owner_id")
    .maybeSingle();

  if (createCustomerError || !createdCustomer) {
    throw createCustomerError || new Error("创建验证客户失败");
  }
  createdIds.customerId = createdCustomer.id;

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

  try {
    const permissionsRes = await app.inject({
      method: "GET",
      url: "/auth/me/permissions",
      headers,
    });

    const permissionsJson = getJson<{
      data: {
        employeeId: string | null;
        permissions: Array<{ code: string; scope: string }>;
      };
    }>(permissionsRes.payload);

    const customerRead = permissionsJson.data.permissions.find((item) =>
      item.code === "customer.read"
    );
    const customerAssignOwner = permissionsJson.data.permissions.find((item) =>
      item.code === "customer.assign_owner"
    );

    pushResult(
      "auth me permissions includes assign owner",
      permissionsRes.statusCode === 200 &&
        permissionsJson.data.employeeId === employeeId &&
        customerRead?.scope === "department" &&
        customerAssignOwner?.scope === "department",
      `statusCode=${permissionsRes.statusCode}, customer.read=${customerRead?.scope ?? "none"}, customer.assign_owner=${customerAssignOwner?.scope ?? "none"}`,
    );

    const detailRes = await app.inject({
      method: "GET",
      url: `/customers/${createdCustomer.id}/detail`,
      headers,
    });

    pushResult(
      "department manager can read department customer",
      detailRes.statusCode === 200,
      `statusCode=${detailRes.statusCode}`,
    );

    const assignSameDepartmentRes = await app.inject({
      method: "PATCH",
      url: `/customers/${createdCustomer.id}`,
      headers,
      payload: JSON.stringify({
        owner_id: targetOwner.id,
      }),
    });

    const assignSameDepartmentJson = getJson<{
      data?: { owner_id: string | null };
      message?: string;
    }>(assignSameDepartmentRes.payload);

    pushResult(
      "assign owner to same department employee",
      assignSameDepartmentRes.statusCode === 200 &&
        assignSameDepartmentJson.data?.owner_id === targetOwner.id,
      `statusCode=${assignSameDepartmentRes.statusCode}, owner_id=${assignSameDepartmentJson.data?.owner_id ?? "null"}`,
    );

    const assignOutsideDepartmentRes = await app.inject({
      method: "PATCH",
      url: `/customers/${createdCustomer.id}`,
      headers,
      payload: JSON.stringify({
        owner_id: outsideEmployee.id,
      }),
    });

    pushResult(
      "assign owner to outside department employee denied",
      assignOutsideDepartmentRes.statusCode === 403,
      `statusCode=${assignOutsideDepartmentRes.statusCode}, payload=${assignOutsideDepartmentRes.payload}`,
    );

    const updateNameRes = await app.inject({
      method: "PATCH",
      url: `/customers/${createdCustomer.id}`,
      headers,
      payload: JSON.stringify({
        name: "不应通过的普通编辑",
      }),
    });

    pushResult(
      "assign owner role does not imply customer.update",
      updateNameRes.statusCode === 403,
      `statusCode=${updateNameRes.statusCode}, payload=${updateNameRes.payload}`,
    );

    const dbCheck = await admin
      .from("customers")
      .select("id, owner_id")
      .eq("id", createdCustomer.id)
      .maybeSingle();

    pushResult(
      "db owner remains same department target",
      !dbCheck.error && dbCheck.data?.owner_id === targetOwner.id,
      `dbError=${dbCheck.error ? "yes" : "no"}, owner_id=${dbCheck.data?.owner_id ?? "null"}`,
    );
  } finally {
    if (createdIds.customerId) {
      await admin.from("customers").delete().eq("id", createdIds.customerId);
    }

    if (createdIds.outsideEmployeeId) {
      await admin.from("employees").delete().eq("id", createdIds.outsideEmployeeId);
    }

    for (const employeeId of createdIds.sameDepartmentEmployeeIds) {
      await admin.from("employees").delete().eq("id", employeeId);
    }

    if (createdIds.outsideDepartmentId) {
      await admin.from("departments").delete().eq("id", createdIds.outsideDepartmentId);
    }

    if (insertedDesignManageRole) {
      await admin
        .from("employee_roles")
        .delete()
        .eq("employee_id", employeeId)
        .eq("role_id", designManageRole.id);
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
  process.exit(1);
});
