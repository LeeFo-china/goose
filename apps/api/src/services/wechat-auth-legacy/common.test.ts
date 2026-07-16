import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";
import {
  verifyTokenDetailed,
  type JwtPayload,
} from "@/utils/jwt";
import type {
  createVisitorSessionResponse as createVisitorSessionResponseType,
  prewarmVisitorHomeData as prewarmVisitorHomeDataType,
  signVisitorSession as signVisitorSessionType,
} from "./common";

const listPublicProjects = mock(async () => [{ id: "project-1" }]);
const prewarmPublicProjectDetailData = mock(async () => undefined);
const getDecorationQaSuggestions = mock(async () => []);

mock.module("@/services/projects", () => ({
  projectSer: {
    listPublicProjects,
    prewarmPublicProjectDetailData,
  },
}));

mock.module("@/services/decoration-qa", () => ({
  getDecorationQaSuggestions,
}));

let prewarmVisitorHomeData: typeof prewarmVisitorHomeDataType;
let signVisitorSession: typeof signVisitorSessionType;
let createVisitorSessionResponse: typeof createVisitorSessionResponseType;

describe("prewarmVisitorHomeData", () => {
  beforeAll(async () => {
    ({
      prewarmVisitorHomeData,
      signVisitorSession,
      createVisitorSessionResponse,
    } = await import("./common"));
    process.env.JWT_SECRET = "test-secret";
  });

  beforeEach(() => {
    listPublicProjects.mockClear();
    prewarmPublicProjectDetailData.mockClear();
    getDecorationQaSuggestions.mockClear();
  });

  test("does not prewarm global public projects for visitors", async () => {
    const backgroundTasks: Array<Promise<unknown>> = [];
    const context = {
      runAuthBackgroundTask: mock((
        _request: FastifyRequest,
        _task: string,
        handler: () => Promise<unknown>,
      ) => {
        const task = handler();
        backgroundTasks.push(task);
        return task;
      }),
    };
    const request = {
      id: "request-1",
      log: {
        info: mock(() => undefined),
        error: mock(() => undefined),
      },
    } as unknown as FastifyRequest;

    prewarmVisitorHomeData.call(context, request);
    await Promise.all(backgroundTasks);

    expect(listPublicProjects).not.toHaveBeenCalled();
    expect(prewarmPublicProjectDetailData).not.toHaveBeenCalled();
    expect(getDecorationQaSuggestions).toHaveBeenCalledTimes(1);
  });

  test("verified visitor token can include trusted auth user and share context", () => {
    const token = signVisitorSession({
      authUserId: "00000000-0000-4000-8000-000000000001",
      openid: "visitor-openid",
      visitorId: "wechat_visitor_hash",
      verifiedPhone: "13800138000",
      shareLinkId: "00000000-0000-4000-8000-000000000002",
    });

    const detailed = verifyTokenDetailed(token);
    expect(detailed.reason).toBe("valid");
    expect(detailed.payload).toMatchObject({
      token_type: "visitor_session",
      sub: "00000000-0000-4000-8000-000000000001",
      openid: "visitor-openid",
      visitor_id: "wechat_visitor_hash",
      roles: ["visitor"],
      verified_phone: "13800138000",
      share_link_id: "00000000-0000-4000-8000-000000000002",
    } satisfies Partial<JwtPayload>);
  });

  test("initial visitor auth response still omits sub and verified phone", () => {
    const response = createVisitorSessionResponse.call({
      signVisitorSession,
    }, {
      openid: "visitor-openid",
      visitorId: "wechat_visitor_hash",
      isNewUser: true,
    });
    const detailed = verifyTokenDetailed(response.token);

    expect(detailed.reason).toBe("valid");
    expect(detailed.payload?.sub).toBeUndefined();
    expect(detailed.payload?.verified_phone).toBeUndefined();
    expect(response.user_id).toBeNull();
  });
});
