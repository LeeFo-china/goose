import { createServer } from "node:http";
import { currentServiceAccessSummary } from "./supplier-purchase-order-mock-fixture.mjs";
import {
  commandResult,
  priceRevision,
  splitPreview,
} from "./supplier-purchase-batch-command-fixture.mjs";
import {
  at,
  batchDetail,
  batchItem,
  batchRecord,
  batchSession,
  catalog,
  categories,
  childOrder,
  childRequisition,
  ids,
  projects,
  settings,
  uuid,
  warehouses,
} from "./supplier-purchase-batch-fixture.mjs";

// UI contract fixture only: isolated HTTP state, no real API, database or provider calls.
const port = Number(process.env.BATCH_MOCK_PORT || "3986");
let state;
function reset(scenario = "empty") {
  const warehouse = scenario.startsWith("warehouse") || scenario === "revision";
  const record = batchRecord(
    warehouse
      ? {
        destination_type: "warehouse",
        project_id: null,
        warehouse_id: warehouses[21].id,
        budget_status: "not_applicable",
      }
      : {},
  );
  if (scenario.includes("pending") || scenario === "revision") {
    Object.assign(record, {
      status: "pending_approval",
      submitted_at: at,
      submitted_by_employee_id: ids.employee,
      split_generation: 1,
      approval_round: 1,
    });
  }
  if (scenario === "paging") {
    Object.assign(record, {
      status: "ordered",
      split_generation: 12,
      item_count: 23,
    });
  }
  state = {
    scenario,
    records: scenario === "empty" || scenario.startsWith("save-") ||
        scenario === "no-warehouses" || scenario === "single-warehouse"
      ? []
      : [record],
    items: new Map([[
      record.id,
      catalog().slice(0, scenario === "paging" ? 23 : 2).map((item, index) =>
        batchItem(item, index)
      ),
    ]]),
    requests: [],
    commands: [],
    keys: new Map(),
    revisionDone: false,
    interrupted: false,
    failDetail: false,
    pendingCatalog: 0,
  };
  if (scenario === "paging") {
    state.records = Array.from(
      { length: 23 },
      (_, index) => ({
        ...record,
        id: index === 0 ? ids.batch : uuid(1300 + index),
        batch_no: `PB-20260907-${String(index + 1).padStart(8, "0")}`,
      }),
    );
  }
}
reset();
const json = (response, status, body) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
};
const data = (response, value) =>
  json(response, 200, { success: true, data: value });
const error = (response, status, code, message, details) =>
  json(response, status, {
    success: false,
    code,
    message,
    ...(details ? { details } : {}),
  });
async function body(request) {
  let text = "";
  for await (const chunk of request) text += chunk;
  return text ? JSON.parse(text) : {};
}
function page(response, url, records, searchFields = ["name"]) {
  const page = Number(url.searchParams.get("page") || 1),
    pageSize = Number(url.searchParams.get("pageSize") || 20);
  if (
    !Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) ||
    pageSize < 1 || pageSize > 100
  ) return error(response, 400, "VALIDATION_ERROR", "分页参数无效");
  const keyword = (url.searchParams.get("keyword") || "").toLowerCase();
  const filtered = records.filter((record) =>
    !keyword ||
    searchFields.some((field) =>
      String(record[field] || "").toLowerCase().includes(keyword)
    )
  );
  return data(response, {
    list: filtered.slice((page - 1) * pageSize, page * pageSize),
    pagination: {
      page,
      pageSize,
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / pageSize),
    },
  });
}
async function command(request, response, url, recordId, kind, role) {
  const payload = await body(request), key = request.headers["idempotency-key"];
  state.commands.push({ path: url.pathname, payload, key, role });
  if (!key) return error(response, 400, "VALIDATION_ERROR", "缺少幂等键");
  const fingerprint = JSON.stringify([url.pathname, payload]);
  const prior = state.keys.get(key);
  if (prior) {
    if (prior.fingerprint !== fingerprint) {
      return error(response, 409, "IDEMPOTENCY_CONFLICT", "幂等键请求不一致");
    }
    return json(response, prior.status, prior.body);
  }
  let record = state.records.find((item) => item.id === recordId);
  const required = kind === "review"
    ? "supplier.purchase-requisition.approve"
    : "supplier.purchase-requisition.manage";
  const permissionCodes = batchSession(role).permissions.map(({ code }) =>
    code
  );
  if (!permissionCodes.includes(required)) {
    return error(response, 403, "FORBIDDEN", "缺少操作权限");
  }
  const warehouse = kind === "save-draft"
    ? payload.destination_type === "warehouse"
    : record?.destination_type === "warehouse";
  if (warehouse && !permissionCodes.includes("inventory.warehouse.manage")) {
    return error(response, 403, "FORBIDDEN", "缺少仓库管理权限");
  }
  if (payload.expected_version !== (record?.version ?? 0)) {
    return error(
      response,
      409,
      "VERSION_CONFLICT",
      "批次版本已变化，请刷新后重试",
    );
  }
  const allowed = kind === "save-draft"
    ? [
      "destination_type",
      "project_id",
      "warehouse_id",
      "expected_version",
      "reason",
      "expected_delivery_date",
      "remark",
      "items",
    ]
    : kind === "review"
    ? ["expected_version", "action", "remark"]
    : kind === "submit"
    ? ["expected_version"]
    : ["expected_version", "reason"];
  if (Object.keys(payload).some((key) => !allowed.includes(key))) {
    return error(response, 400, "VALIDATION_ERROR", "请求包含未知字段");
  }
  let result;
  if (kind === "save-draft") {
    if (
      !payload.reason?.trim() || !payload.items?.length ||
      payload.items.length > 100 || payload.items.some((item) =>
        Object.keys(item).some((key) =>
          !["supplier_sku_id", "quantity", "cost_category_id"].includes(key)
        )
      )
    ) {
      return error(response, 400, "VALIDATION_ERROR", "草稿明细无效");
    }
    if (
      warehouse
        ? payload.project_id !== null || !payload.warehouse_id
        : !payload.project_id || payload.warehouse_id !== null
    ) {
      return error(response, 400, "VALIDATION_ERROR", "采购去向不一致");
    }
    const items = payload.items.map((line, index) =>
      batchItem(
        catalog().find((item) =>
          item.supplier_sku_id === line.supplier_sku_id
        ),
        index,
        recordId,
        Number(line.quantity).toFixed(4),
        line.cost_category_id,
      )
    );
    const split_preview = splitPreview(items),
      total = split_preview.reduce(
        (sum, item) => sum + Number(item.total_amount),
        0,
      ).toFixed(2);
    record = batchRecord({
      ...record,
      id: recordId,
      destination_type: payload.destination_type,
      project_id: payload.project_id,
      warehouse_id: payload.warehouse_id,
      reason: payload.reason,
      expected_delivery_date: payload.expected_delivery_date,
      remark: payload.remark,
      status: "draft",
      budget_status: warehouse ? "not_applicable" : "unchecked",
      version: (record?.version ?? 0) + 1,
      item_count: items.length,
      supplier_count: split_preview.length,
      subtotal_amount: total,
      total_amount: total,
    });
    state.records = [
      record,
      ...state.records.filter((item) => item.id !== recordId),
    ];
    state.items.set(recordId, items);
    result = {
      status: "saved",
      idempotent: false,
      batch: record,
      version: record.version,
      split_preview,
    };
    if (state.scenario === "save-refresh-failed") state.failDetail = true;
  } else {
    if (!record) return error(response, 404, "NOT_FOUND", "批次不存在");
    if (
      kind === "review" && state.scenario === "revision" && !state.revisionDone
    ) {
      state.revisionDone = true;
      record.status = "draft";
      record.version += 1;
      const responseBody = {
        success: false,
        code: "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED",
        message: "采购价格已变化，请重新保存草稿",
        details: priceRevision(record),
      };
      state.keys.set(key, { fingerprint, status: 409, body: responseBody });
      return json(response, 409, responseBody);
    }
    if (
      (kind === "cancel" ||
        (kind === "review" && payload.action === "reject")) &&
      !(payload.reason || payload.remark)?.trim()
    ) return error(response, 400, "VALIDATION_ERROR", "原因必填");
    if (
      !(kind === "review" && payload.action === "approve" &&
        state.scenario === "warehouse-pending-next")
    ) record.version += 1;
    if (kind === "submit") {
      record.status = "pending_approval";
      record.submitted_at = at;
      record.submitted_by_employee_id = ids.employee;
      record.split_generation += 1;
      record.approval_round += 1;
    }
    if (kind === "withdraw") record.status = "draft";
    if (kind === "cancel") record.status = "cancelled";
    if (kind === "review") {
      record.status = payload.action === "reject"
        ? "rejected"
        : state.scenario === "warehouse-pending-next"
        ? "pending_approval"
        : "ordered";
    }
    result = commandResult(kind, record, state.items.get(record.id) || []);
  }
  const responseBody = { success: true, data: structuredClone(result) };
  state.keys.set(key, { fingerprint, status: 200, body: responseBody });
  if (state.scenario === "save-truncated" && !state.interrupted) {
    state.interrupted = true;
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"success":true,"data":');
    return;
  }
  if (state.scenario === "save-uncertain" && !state.interrupted) {
    state.interrupted = true;
    response.destroy();
    return;
  }
  json(response, 200, responseBody);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/health") return data(response, { ok: true });
    if (url.pathname === "/__test/reset") {
      reset(url.searchParams.get("scenario") || "empty");
      return data(response, {});
    }
    if (url.pathname === "/__test/state") {
      return json(response, 200, {
        records: state.records,
        requests: state.requests,
        commands: state.commands,
        pendingCatalog: state.pendingCatalog,
      });
    }
    if (url.pathname === "/__test/allow-detail") {
      state.failDetail = false;
      return data(response, {});
    }
    if (url.pathname === "/admin/auth/login") {
      return data(response, batchSession((await body(request)).phone));
    }
    const role =
      request.headers.authorization?.replace(/^Bearer batch-/, "").replace(
        /-token$/,
        "",
      ) || "manager";
    if (url.pathname === "/admin/auth/me") {
      return data(response, batchSession(role));
    }
    if (url.pathname === "/employee/service-access") {
      return data(response, currentServiceAccessSummary());
    }
    if (request.method === "GET") {
      state.requests.push(url.pathname + url.search);
    }
    const permissions = batchSession(role).permissions.map(({ code }) => code);
    if (request.method === "GET" && url.pathname === "/notifications/summary") {
      return data(response, { unread_count: 0 });
    }
    if (url.pathname === "/supplier-settings") {
      if (!permissions.includes("supplier.view")) {
        return error(response, 403, "FORBIDDEN", "缺少供应商查看权限");
      }
      return data(response, {
        ...settings,
        warehouse_procurement_enabled: state.scenario !== "warehouse-gate-off",
        purchase_batch_workflow_enabled:
          state.scenario !== "warehouse-workflow-off",
      });
    }
    if (url.pathname === "/warehouses") {
      if (!permissions.includes("inventory.warehouse.view")) {
        return error(response, 403, "FORBIDDEN", "缺少仓库查看权限");
      }
      const rows = state.scenario === "no-warehouses"
        ? []
        : state.scenario === "single-warehouse"
        ? warehouses.slice(0, 1)
        : warehouses;
      return page(
        response,
        url,
        rows.filter((item) =>
          !url.searchParams.get("status") ||
          item.status === url.searchParams.get("status")
        ),
      );
    }
    if (url.pathname === "/supplier-purchase-batch-project-options") {
      return page(response, url, projects);
    }
    if (url.pathname === "/supplier-purchase-batch-cost-categories") {
      return page(response, url, categories);
    }
    if (url.pathname === "/supplier-purchase-batch-catalog") {
      if (
        url.searchParams.get("destinationType") === "warehouse"
          ? !url.searchParams.get("warehouseId") ||
            url.searchParams.has("projectId")
          : !url.searchParams.get("projectId") ||
            url.searchParams.has("warehouseId")
      ) return error(response, 400, "VALIDATION_ERROR", "目录去向无效");
      if (url.searchParams.get("keyword") === "慢商品") {
        state.pendingCatalog += 1;
        await new Promise((resolve) => setTimeout(resolve, 800));
        state.pendingCatalog -= 1;
        return page(response, url, [{
          ...catalog()[0],
          product_name: "慢商品旧结果",
        }], ["product_name"]);
      }
      return page(response, url, catalog(), ["product_name", "sku_code"]);
    }
    if (url.pathname === "/supplier-purchase-batches") {
      const keyword = url.searchParams.get("keyword");
      if (keyword === "读取错误") {
        return error(response, 503, "UNAVAILABLE", "批次暂时无法读取");
      }
      if (keyword === "慢结果") {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      const rows = state.records.filter((item) =>
        (!url.searchParams.get("status") ||
          item.status === url.searchParams.get("status")) &&
        (!url.searchParams.get("destinationType") ||
          item.destination_type === url.searchParams.get("destinationType")) &&
        (!url.searchParams.get("warehouseId") ||
          item.warehouse_id === url.searchParams.get("warehouseId")) &&
        (!url.searchParams.get("projectId") ||
          item.project_id === url.searchParams.get("projectId")) &&
        (item.destination_type !== "warehouse" ||
          permissions.includes("inventory.warehouse.view"))
      );
      return page(
        response,
        url,
        rows.map((record) => batchDetail(record, role)),
        ["batch_no", "reason"],
      );
    }
    const match = /^\/supplier-purchase-batches\/([^/]+)(?:\/([^/]+))?$/.exec(
      url.pathname,
    );
    if (match) {
      const [, id, child] = match;
      if (request.method === "POST") {
        return await command(request, response, url, id, child, role);
      }
      const record = state.records.find((item) => item.id === id);
      if (!record) return error(response, 404, "NOT_FOUND", "批次不存在");
      if (
        record.destination_type === "warehouse" &&
        !permissions.includes("inventory.warehouse.view")
      ) return error(response, 403, "FORBIDDEN", "缺少仓库查看权限");
      if (!child) {
        if (state.failDetail) {
          return error(response, 503, "UNAVAILABLE", "详情刷新失败");
        }
        return data(response, batchDetail(record, role));
      }
      if (child === "items") {
        return page(response, url, state.items.get(id) || []);
      }
      const count = state.scenario === "paging"
        ? 23
        : record.split_generation
        ? 2
        : 0;
      if (child === "requisitions") {
        return page(
          response,
          url,
          Array.from(
            { length: count },
            (_, index) => childRequisition(record, index),
          ),
        );
      }
      if (child === "orders") {
        return page(
          response,
          url,
          record.status === "ordered"
            ? Array.from(
              { length: count },
              (_, index) => childOrder(record, index),
            )
            : [],
        );
      }
    }
    return error(
      response,
      404,
      "MOCK_ROUTE_NOT_FOUND",
      `Fixture route missing: ${url.pathname}`,
    );
  } catch (caught) {
    console.error(caught);
    if (!response.headersSent) {
      error(response, 500, "FIXTURE_ERROR", String(caught));
    }
  }
});
server.listen(port, "127.0.0.1");
process.on("SIGTERM", () => server.close(() => process.exit(0)));
