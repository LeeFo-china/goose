import { describe, expect, test } from "bun:test";
import { buildCustomersHref } from "./customer-list-actions";

describe("customer list actions", () => {
  test("keeps measured page size while changing pages or filters", () => {
    expect(buildCustomersHref({
      page: 2,
      pageSize: 10,
      status: "following",
      source: "douyin",
      customerOrigin: "employee_created",
      keyword: "张三",
      follow: "due",
    })).toBe(
      "/customers?page=2&pageSize=10&status=following&source=douyin&customer_origin=employee_created&keyword=%E5%BC%A0%E4%B8%89&follow=due",
    );
  });
});
