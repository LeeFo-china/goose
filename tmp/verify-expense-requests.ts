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
const createdExpenseRequestIds: string[] = [];

function pushResult(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
}

function getJson<T>(payload: string) {
  return JSON.parse(payload) as T;
}

function ensureSuccessResponse(
  step: string,
  response: { statusCode: number; payload: string },
) {
  if (response.statusCode !== 200) {
    throw new Error(
      `${step} failed: statusCode=${response.statusCode}, payload=${response.payload}`,
    );
  }
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

  const authHeaders = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };

  const operatorId = process.env.VERIFY_EMPLOYEE_ID;
  if (!operatorId) {
    throw new Error("验证失败：缺少 VERIFY_EMPLOYEE_ID 环境变量");
  }

  try {
    const createDraft = await app.inject({
      method: "POST",
      url: "/expense-requests",
      headers: authHeaders,
      payload: JSON.stringify({
        employee_id: operatorId,
        project_id: null,
        mode: "reimbursement",
        title: "验证费用申请-支付链路",
        items: [
          {
            occurred_at: "2026-04-19T09:00:00.000Z",
            category: "材料费",
            amount: 320.5,
            remark: "木工辅料采购",
            invoice_no: "VERIFY-EXP-001",
            vendor_name: "验证建材店",
            evidence_images: ["verify-expense-item-1"],
          },
          {
            occurred_at: "2026-04-19T10:00:00.000Z",
            category: "运输费",
            amount: 80,
            remark: "同城配送",
            invoice_no: null,
            vendor_name: "验证货运",
            evidence_images: [],
          },
        ],
      }),
    });
    ensureSuccessResponse("create draft", createDraft);

    const createDraftJson = getJson<{ data: { id: string; status: string; current_step: string; total_amount: number; request_no: string | null } }>(createDraft.payload);
    const paidFlowId = createDraftJson.data.id;
    createdExpenseRequestIds.push(paidFlowId);
    pushResult(
      "create draft",
      createDraft.statusCode === 200
        && createDraftJson.data.status === "draft"
        && createDraftJson.data.current_step === "draft"
        && Number(createDraftJson.data.total_amount) === 400.5,
      `statusCode=${createDraft.statusCode}, status=${createDraftJson.data.status}, step=${createDraftJson.data.current_step}, total=${createDraftJson.data.total_amount}, request_no=${createDraftJson.data.request_no}`,
    );

    const submit = await app.inject({
      method: "POST",
      url: `/expense-requests/${paidFlowId}/submit`,
      headers: authHeaders,
      payload: JSON.stringify({
        operator_id: operatorId,
        comment: "验证提交",
      }),
    });
    ensureSuccessResponse("submit expense request", submit);

    const submitJson = getJson<{ data: { status: string; current_step: string } }>(submit.payload);
    pushResult(
      "submit expense request",
      submit.statusCode === 200
        && submitJson.data.status === "pending"
        && submitJson.data.current_step === "manager_review",
      `statusCode=${submit.statusCode}, status=${submitJson.data.status}, step=${submitJson.data.current_step}`,
    );

    const approveManager = await app.inject({
      method: "POST",
      url: `/expense-requests/${paidFlowId}/approve`,
      headers: authHeaders,
      payload: JSON.stringify({
        approver_id: operatorId,
        comment: "验证主管通过",
      }),
    });
    ensureSuccessResponse("approve manager review", approveManager);

    const approveManagerJson = getJson<{ data: { status: string; current_step: string } }>(approveManager.payload);
    pushResult(
      "approve manager review",
      approveManager.statusCode === 200
        && approveManagerJson.data.status === "pending"
        && approveManagerJson.data.current_step === "finance_review",
      `statusCode=${approveManager.statusCode}, status=${approveManagerJson.data.status}, step=${approveManagerJson.data.current_step}`,
    );

    const approveFinance = await app.inject({
      method: "POST",
      url: `/expense-requests/${paidFlowId}/approve`,
      headers: authHeaders,
      payload: JSON.stringify({
        approver_id: operatorId,
        comment: "验证财务通过",
      }),
    });
    ensureSuccessResponse("approve finance review", approveFinance);

    const approveFinanceJson = getJson<{ data: { status: string; current_step: string } }>(approveFinance.payload);
    pushResult(
      "approve finance review",
      approveFinance.statusCode === 200
        && approveFinanceJson.data.status === "approved"
        && approveFinanceJson.data.current_step === "payment",
      `statusCode=${approveFinance.statusCode}, status=${approveFinanceJson.data.status}, step=${approveFinanceJson.data.current_step}`,
    );

    const pay = await app.inject({
      method: "POST",
      url: `/expense-requests/${paidFlowId}/pay`,
      headers: authHeaders,
      payload: JSON.stringify({
        payee_name: "验证收款人",
        payee_bank: "招商银行",
        payee_account: "6225888888888888",
        method: "bank_transfer",
        paid_amount: 400.5,
        paid_at: "2026-04-19T16:00:00.000Z",
        paid_by: operatorId,
        evidence_images: ["verify-payment-proof-1"],
        remark: "验证打款",
      }),
    });
    ensureSuccessResponse("pay expense request", pay);

    const payJson = getJson<{ data: { status: string; current_step: string; settlement: { method: string; paid_amount: number }[] | { method: string; paid_amount: number } | null } }>(pay.payload);
    const settlement = Array.isArray(payJson.data.settlement)
      ? payJson.data.settlement[0]
      : payJson.data.settlement;
    pushResult(
      "pay expense request",
      pay.statusCode === 200
        && payJson.data.status === "paid"
        && payJson.data.current_step === "done"
        && settlement?.method === "bank_transfer"
        && Number(settlement?.paid_amount) === 400.5,
      `statusCode=${pay.statusCode}, status=${payJson.data.status}, step=${payJson.data.current_step}, method=${settlement?.method}, paid_amount=${settlement?.paid_amount}`,
    );

    const createRejectDraft = await app.inject({
      method: "POST",
      url: "/expense-requests",
      headers: authHeaders,
      payload: JSON.stringify({
        employee_id: operatorId,
        project_id: null,
        mode: "advance",
        title: "验证费用申请-驳回链路",
        items: [
          {
            occurred_at: "2026-04-19T11:00:00.000Z",
            category: "差旅费",
            amount: 200,
            remark: "高铁票",
            invoice_no: "VERIFY-EXP-002",
            vendor_name: "12306",
            evidence_images: ["verify-expense-item-2"],
          },
        ],
      }),
    });
    ensureSuccessResponse("create reject flow draft", createRejectDraft);

    const createRejectDraftJson = getJson<{ data: { id: string } }>(createRejectDraft.payload);
    const rejectFlowId = createRejectDraftJson.data.id;
    createdExpenseRequestIds.push(rejectFlowId);

    await app.inject({
      method: "POST",
      url: `/expense-requests/${rejectFlowId}/submit`,
      headers: authHeaders,
      payload: JSON.stringify({
        operator_id: operatorId,
        comment: "验证提交-驳回链路",
      }),
    });

    const reject = await app.inject({
      method: "POST",
      url: `/expense-requests/${rejectFlowId}/reject`,
      headers: authHeaders,
      payload: JSON.stringify({
        approver_id: operatorId,
        rejected_reason: "附件不完整",
        comment: "附件不完整",
      }),
    });
    ensureSuccessResponse("reject expense request", reject);

    const rejectJson = getJson<{ data: { status: string; current_step: string; rejected_reason: string | null } }>(reject.payload);
    pushResult(
      "reject expense request",
      reject.statusCode === 200
        && rejectJson.data.status === "rejected"
        && rejectJson.data.current_step === "draft"
        && rejectJson.data.rejected_reason === "附件不完整",
      `statusCode=${reject.statusCode}, status=${rejectJson.data.status}, step=${rejectJson.data.current_step}, rejected_reason=${rejectJson.data.rejected_reason}`,
    );

    const listMine = await app.inject({
      method: "GET",
      url: `/expense-requests?page=1&pageSize=10&employee_id=${operatorId}&keyword=验证费用申请`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    ensureSuccessResponse("list expense requests", listMine);

    const listMineJson = getJson<{ data: { list: Array<{ id: string }>; pagination: { total: number } } }>(listMine.payload);
    pushResult(
      "list expense requests",
      listMine.statusCode === 200
        && listMineJson.data.pagination.total >= 2
        && listMineJson.data.list.length >= 2,
      `statusCode=${listMine.statusCode}, total=${listMineJson.data.pagination.total}, list_length=${listMineJson.data.list.length}`,
    );
  } finally {
    if (createdExpenseRequestIds.length > 0) {
      await SupabaseDB.getAdminClient()
        .from("expense_requests")
        .delete()
        .in("id", createdExpenseRequestIds);
    }

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
