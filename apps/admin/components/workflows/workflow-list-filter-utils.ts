export type WorkflowListHrefInput = {
  page?: number;
  pageSize?: number;
  status?: string;
  category?: string;
  keyword?: string;
};

export function buildWorkflowsHref(input: WorkflowListHrefInput) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.pageSize && input.pageSize > 0) {
    params.set("pageSize", String(input.pageSize));
  }
  if (input.status) params.set("status", input.status);
  if (input.category) params.set("category", input.category);
  if (input.keyword) params.set("keyword", input.keyword);

  const query = params.toString();
  return query ? `/workflows?${query}` : "/workflows";
}
