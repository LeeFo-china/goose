import { describe, expect, mock, test } from "bun:test";

const orFilter = mock((condition: string) => queryBuilder);
const ilike = mock((column: string, pattern: string) => queryBuilder);

const queryBuilder = {
  select: mock(() => queryBuilder),
  eq: mock(() => queryBuilder),
  in: mock(() => queryBuilder),
  or: orFilter,
  ilike,
  order: mock(() => queryBuilder),
  range: mock(async () => ({
    data: [],
    error: null,
    count: 0,
  })),
};

mock.module("@/utils/supabase", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: () => queryBuilder,
    }),
  },
}));

describe("projectProcedureAssignmentRepository.listCandidateEmployees", () => {
  test("searches candidate employees by name or phone keyword", async () => {
    const { projectProcedureAssignmentRepository } = await import(
      "./project-procedure-assignments"
    );

    await projectProcedureAssignmentRepository.listCandidateEmployees({
      tenantId: "tenant-1",
      keyword: "18800003002",
      page: 1,
      pageSize: 20,
    });

    expect(ilike).not.toHaveBeenCalled();
    expect(orFilter).toHaveBeenCalledWith(
      "name.ilike.%18800003002%,phone.ilike.%18800003002%",
    );
  });
});
