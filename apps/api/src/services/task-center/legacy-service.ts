import {
  getSummary,
  listTodos,
} from "./legacy/actions";
import type { TaskCenterSummary } from "./legacy/shared";
export type { TaskCenterTodoItem } from "./legacy/shared";

class TaskCenterService {
  summaryCache = new Map<string, {
    expiresAt: number;
    value: TaskCenterSummary;
  }>();
  summaryInFlight = new Map<string, Promise<TaskCenterSummary>>();

  listTodos = listTodos;
  getSummary = getSummary;
}

export const taskCenterService = new TaskCenterService();
