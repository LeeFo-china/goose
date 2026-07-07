import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  PlatformPartnerMemberRebindRequestRecord,
} from "@/repositories/platform-partner-member-rebind";
import type {
  PlatformPartnerMemberRecord,
  PlatformPartnerRecord,
} from "@/repositories/platform-partner-portal";
import type { AuthContext } from "@/services/authorization";
import type { JwtPayload } from "@/utils/jwt";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const partner = {
  id: "00000000-0000-4000-8000-000000000201",
  name: "信阳城市合伙人",
  status: "active",
  region_codes: ["411500"],
  level: {
    id: "00000000-0000-4000-8000-000000000101",
    code: "city",
    name: "城市合伙人",
    status: "active",
  },
} satisfies PlatformPartnerRecord;

const member = {
  id: "00000000-0000-4000-8000-000000000301",
  partner_id: partner.id,
  auth_user_id: "00000000-0000-4000-8000-000000000401",
  name: "张三",
  phone: "13800138000",
  role: "owner",
  status: "active",
  partner,
} satisfies PlatformPartnerMemberRecord;

const visitorUser = {
  token_type: "visitor_session",
  login_channel: "wechat",
  openid: "new-openid",
  unionid: "new-unionid",
  visitor_id: "wechat_visitor_new",
  roles: ["visitor"],
} satisfies JwtPayload;

const platformAuthContext = {
  authUserId: "auth-platform",
  employeeId: "employee-platform",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台超管",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [{ code: "platform.partner.manage", scope: "all" }],
} satisfies AuthContext;

const verificationCode = {
  id: "00000000-0000-4000-8000-000000000901",
  phone: member.phone,
  scene: "rebind_platform_partner",
  code: "123456",
  status: "pending",
  expired_at: "2026-07-07T10:05:00.000Z",
  verified_at: null,
  created_at: "2026-07-07T10:00:00.000Z",
  request_ip: null,
  request_device: null,
} as const;

const pendingRequest = {
  id: "00000000-0000-4000-8000-000000000801",
  partner_id: partner.id,
  member_id: member.id,
  phone: member.phone,
  old_auth_user_id: member.auth_user_id,
  new_auth_user_id: "00000000-0000-4000-8000-000000000402",
  applicant_name: "新微信申请人",
  reason: "旧微信不可用",
  status: "pending",
  reviewer_employee_id: null,
  review_comment: null,
  reviewed_at: null,
  created_at: "2026-07-07T10:00:00.000Z",
  updated_at: "2026-07-07T10:00:00.000Z",
  member,
  partner,
} satisfies PlatformPartnerMemberRebindRequestRecord;

const repository = {
  findBoundMemberByPhone: mock(async () => member),
  findPendingDuplicateByMemberId: mock(async () => null),
  createRequest: mock(async () => pendingRequest),
  listRequests: mock(async () => ({
    list: [pendingRequest],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  findRequestById: mock(async () => pendingRequest),
  approveRequest: mock(async () => ({
    status: "approved" as const,
    request: { ...pendingRequest, status: "approved" as const },
  })),
  rejectRequest: mock(async () => ({ ...pendingRequest, status: "rejected" as const })),
};

const smsService = {
  sendCode: mock(async () => ({ success: true as const, cooldown_seconds: 60 })),
  findValidPending: mock(async (): Promise<typeof verificationCode | null> => verificationCode),
  markVerified: mock(async () => undefined),
};

const authUserResolver = mock(async () => ({
  userId: pendingRequest.new_auth_user_id,
  isNewUser: true,
}));
const oauthIdentityEnsurer = mock(async () => undefined);
const auditLogService = {
  recordBestEffort: mock(async () => null),
};
const authorizationService = {
  invalidateAuthContext: mock(() => undefined),
};

const migrationDir = join(import.meta.dir, "../../../../supabase/migrations");

function readMigration(suffix: string) {
  const file = readdirSync(migrationDir)
    .filter((name) => name.endsWith(suffix))
    .sort()
    .at(-1);
  expect(file).toBeTruthy();
  return readFileSync(join(migrationDir, file as string), "utf8");
}

async function createService() {
  const { PlatformPartnerMemberRebindService } = await import(
    "./platform-partner-member-rebind"
  );
  return new PlatformPartnerMemberRebindService({
    repository,
    smsService,
    authUserResolver,
    oauthIdentityEnsurer,
    auditLogService,
    authorizationService,
  });
}

describe("platform partner member rebind migration", () => {
  test("creates partner member rebind request table and review RPC", () => {
    const sql = readMigration("_platform_partner_member_rebind_requests.sql");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_partner_member_rebind_requests");
    expect(sql).toContain("status IN ('pending', 'approved', 'rejected', 'cancelled')");
    expect(sql).toContain("platform_partner_member_rebind_requests_member_pending_unique_idx");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.approve_platform_partner_member_rebind_request");
    expect(sql).toContain("'rebind_platform_partner'::text");
  });
});

describe("PlatformPartnerMemberRebindService", () => {
  beforeEach(() => {
    for (const fn of Object.values(repository)) fn.mockClear();
    for (const fn of Object.values(smsService)) fn.mockClear();
    authUserResolver.mockClear();
    oauthIdentityEnsurer.mockClear();
    auditLogService.recordBestEffort.mockClear();
    authorizationService.invalidateAuthContext.mockClear();
    repository.findBoundMemberByPhone.mockImplementation(async () => member);
    repository.findPendingDuplicateByMemberId.mockImplementation(async () => null);
    repository.createRequest.mockImplementation(async () => pendingRequest);
    repository.findRequestById.mockImplementation(async () => pendingRequest);
    repository.approveRequest.mockImplementation(async () => ({
      status: "approved" as const,
      request: { ...pendingRequest, status: "approved" as const },
    }));
    smsService.findValidPending.mockImplementation(async () => verificationCode);
  });

  test("sendRebindCode sends SMS only to an active member that is already bound", async () => {
    const service = await createService();

    const result = await service.sendRebindCode({
      phone: member.phone,
      requestIp: "127.0.0.1",
      requestDevice: "mini-device",
    });

    expect(result).toEqual({ success: true, cooldown_seconds: 60 });
    expect(repository.findBoundMemberByPhone).toHaveBeenCalledWith(member.phone);
    expect(smsService.sendCode).toHaveBeenCalledWith({
      phone: member.phone,
      scene: "rebind_platform_partner",
      requestIp: "127.0.0.1",
      requestDevice: "mini-device",
    });
  });

  test("createRequest resolves new auth user from visitor token and stores a pending review request", async () => {
    const service = await createService();

    const result = await service.createRequest(visitorUser, {
      phone: ` ${member.phone} `,
      sms_code: "123456",
      applicant_name: " 新微信申请人 ",
      reason: " 旧微信不可用 ",
    });

    expect(authUserResolver).toHaveBeenCalledWith({
      openid: visitorUser.openid,
      unionid: visitorUser.unionid,
    });
    expect(oauthIdentityEnsurer).toHaveBeenCalledWith({
      userId: pendingRequest.new_auth_user_id,
      openid: visitorUser.openid,
      unionid: visitorUser.unionid,
    });
    expect(repository.createRequest).toHaveBeenCalledWith({
      partnerId: partner.id,
      memberId: member.id,
      phone: member.phone,
      oldAuthUserId: member.auth_user_id,
      newAuthUserId: pendingRequest.new_auth_user_id,
      applicantName: "新微信申请人",
      reason: "旧微信不可用",
    });
    expect(smsService.markVerified).toHaveBeenCalledWith(verificationCode.id);
    expect(result).toEqual({
      id: pendingRequest.id,
      status: "pending",
      message: "换绑申请已提交，请等待平台审核",
    });
  });

  test("createRequest rejects reusable SMS code before creating duplicate request", async () => {
    smsService.findValidPending.mockImplementation(async () => null);
    const service = await createService();

    await expect(service.createRequest(visitorUser, {
      phone: member.phone,
      sms_code: "123456",
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "SMS_CODE_INVALID",
    });
    expect(repository.createRequest).not.toHaveBeenCalled();
  });

  test("approve verifies state and transfers only partner member binding", async () => {
    const service = await createService();

    const result = await service.approve(platformAuthContext, pendingRequest.id, {
      comment: "人工核实通过",
    });

    expect(repository.approveRequest).toHaveBeenCalledWith({
      id: pendingRequest.id,
      reviewerEmployeeId: platformAuthContext.employeeId,
      comment: "人工核实通过",
    });
    expect(authorizationService.invalidateAuthContext).toHaveBeenCalledWith({
      authUserId: pendingRequest.old_auth_user_id,
    });
    expect(authorizationService.invalidateAuthContext).toHaveBeenCalledWith({
      authUserId: pendingRequest.new_auth_user_id,
    });
    expect(auditLogService.recordBestEffort).toHaveBeenCalled();
    expect(result.status).toBe("approved");
  });

  test("approve requires platform partner manage permission", async () => {
    const service = await createService();

    await expect(service.approve({
      ...platformAuthContext,
      permissions: [],
    }, pendingRequest.id, {})).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
