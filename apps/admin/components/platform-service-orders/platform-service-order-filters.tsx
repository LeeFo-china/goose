import { FilterSelect } from "@/components/admin/filter-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  paymentStatusOptions,
  refundStatusOptions,
  serviceStatusOptions,
  type PlatformServiceTab,
} from "./platform-service-order-rules";

export function PlatformServiceOrderFilters({
  activeTab,
  keyword,
  tenantKeyword,
  status,
  paymentStatus,
  serviceStatus,
  assigneeEmployeeId,
}: {
  activeTab: PlatformServiceTab;
  keyword?: string;
  tenantKeyword?: string;
  status?: string;
  paymentStatus?: string;
  serviceStatus?: string;
  assigneeEmployeeId?: string;
}) {
  return (
    <form className="flex flex-wrap items-center gap-2" action="/platform/service-orders">
      <input type="hidden" name="tab" value={activeTab} />
      <Input
        name="keyword"
        defaultValue={keyword}
        placeholder={
          activeTab === "orders"
            ? "搜索订单号/套餐"
            : activeTab === "workOrders"
              ? "搜索工单订单号"
              : "搜索退款原因"
        }
        className="h-9 min-w-[220px] flex-1"
      />
      <Input
        name="tenantKeyword"
        defaultValue={tenantKeyword}
        placeholder="搜索租户"
        className="h-9 w-44"
      />
      {activeTab === "orders" ? (
        <>
          <FilterSelect
            label="支付"
            name="paymentStatus"
            defaultValue={paymentStatus}
            options={[...paymentStatusOptions]}
          />
          <FilterSelect
            label="服务"
            name="serviceStatus"
            defaultValue={serviceStatus}
            options={[...serviceStatusOptions]}
          />
        </>
      ) : activeTab === "workOrders" ? (
        <>
          <FilterSelect
            label="状态"
            name="status"
            defaultValue={status}
            options={serviceStatusOptions.filter((item) => item.value !== "waiting_payment")}
          />
          <Input
            name="assigneeEmployeeId"
            defaultValue={assigneeEmployeeId}
            placeholder="负责人员工 ID"
            className="h-9 w-48"
          />
        </>
      ) : (
        <FilterSelect
          label="状态"
          name="status"
          defaultValue={status}
          options={[...refundStatusOptions]}
        />
      )}
      <Button type="submit" size="sm">筛选</Button>
    </form>
  );
}
