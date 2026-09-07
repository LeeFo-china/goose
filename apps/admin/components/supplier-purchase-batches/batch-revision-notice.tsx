import { StatusAlert } from "@/components/admin/status-alert";
import { batchMoney } from "./batch-page-parts";
import type { revisionDetails } from "./batch-rules";

export type BatchRevision = NonNullable<ReturnType<typeof revisionDetails>>;
function text(record: object, key: string) {
  const value = Reflect.get(record, key);
  return typeof value === "string" ? value : null;
}
function blockerMessage(value: unknown) {
  if (!value || typeof value !== "object") {
    return "采购校验发生变化，请重新保存草稿。";
  }
  if (text(value, "kind") === "price") {
    const name =
      [text(value, "product_name"), text(value, "sku_name")].filter(Boolean)
        .join(" · ") || "商品";
    const frozen = text(value, "frozen_unit_price"),
      current = text(value, "current_unit_price");
    return `${name}：冻结单价 ${
      frozen ? batchMoney(frozen) : "不可用"
    }，当前单价 ${current ? batchMoney(current) : "不可采购"}`;
  }
  if (text(value, "kind") === "budget") {
    const requested = text(value, "current_requested_amount"),
      available = text(value, "current_available_amount");
    return `项目成本类目预算已变化：当前申请额 ${
      requested ? batchMoney(requested) : "待核查"
    }，可用预算 ${available ? batchMoney(available) : "待核查"}`;
  }
  return text(value, "kind") === "supplier"
    ? "供应商采购资格已变化，请核查合作状态与合同。"
    : "商品采购资格已变化，请重新选择有效商品。";
}
export function BatchRevisionNotice({ revision }: { revision: BatchRevision }) {
  return (
    <StatusAlert tone="warning" title="审批校验发生变化">
      <p>批次已退回草稿。请检查以下变更，重新保存后再提交审批。</p>
      <p>
        本次修订已保存为版本{" "}
        {revision.version}；这是本次审批的修订回执，不代表当前最新版本。
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {revision.details.map((blocker, index) => (
          <li key={index}>{blockerMessage(blocker)}</li>
        ))}
      </ul>
    </StatusAlert>
  );
}
