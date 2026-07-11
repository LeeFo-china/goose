import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";
import type { prewarmVisitorHomeData as prewarmVisitorHomeDataType } from "./common";

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

describe("prewarmVisitorHomeData", () => {
  beforeAll(async () => {
    ({ prewarmVisitorHomeData } = await import("./common"));
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
});
