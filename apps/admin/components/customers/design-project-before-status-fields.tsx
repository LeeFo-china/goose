"use client";

import { FormSelect } from "@/components/admin/form-select";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerRecord, ProjectEmployeeOption } from "@/components/customers/customer-mutation-types";
import { InfoItem } from "@/components/customers/customer-mutation-shared";

export function DesignProjectContextInfo({
  customer,
  propertyName,
  existingPropertyId,
}: {
  customer: CustomerRecord;
  propertyName: string;
  existingPropertyId: string | null;
}) {
  return (
    <>
      <InfoItem label="关联客户" value={customer.name || customer.phone_masked || customer.phone || "-"} />
      <InfoItem
        label="主房产"
        value={existingPropertyId ? propertyName || "已选择主房产" : "待补全"}
      />
    </>
  );
}

export function DesignProjectPropertySection({
  needsProperty,
  disabled,
  existingProperty,
  customer,
  propertyCommunity,
  propertyBuildingInfo,
  propertyArea,
  propertyLayout,
  onPropertyCommunityChange,
  onPropertyBuildingInfoChange,
  onPropertyAreaChange,
  onPropertyLayoutChange,
}: {
  needsProperty: boolean;
  disabled: boolean;
  existingProperty: ReturnType<typeof import("@/components/customers/customer-mutation-shared").getPrimaryCustomerProperty>;
  customer: CustomerRecord;
  propertyCommunity: string;
  propertyBuildingInfo: string;
  propertyArea: string;
  propertyLayout: string;
  onPropertyCommunityChange: (value: string) => void;
  onPropertyBuildingInfoChange: (value: string) => void;
  onPropertyAreaChange: (value: string) => void;
  onPropertyLayoutChange: (value: string) => void;
}) {
  return (
    <section className="md:col-span-2 rounded-md border bg-muted/20 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">主房产信息</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {needsProperty
              ? "开始设计必须先绑定主房产，提交后会自动设为客户主房产。"
              : "当前项目会绑定这个客户主房产。"}
          </p>
        </div>
        <Badge variant={needsProperty ? "warning" : "success"}>
          {needsProperty ? "待补全" : "已绑定"}
        </Badge>
      </div>
      {needsProperty ? (
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="design-property-community">小区名称</FieldLabel>
            <Input
              id="design-property-community"
              value={propertyCommunity}
              disabled={disabled}
              placeholder="例如：万科城市花园"
              onChange={(event) => onPropertyCommunityChange(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="design-property-building">楼栋门牌</FieldLabel>
            <Input
              id="design-property-building"
              value={propertyBuildingInfo}
              disabled={disabled}
              placeholder="例如：12栋1单元1203"
              onChange={(event) => onPropertyBuildingInfoChange(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="design-property-area">面积</FieldLabel>
            <Input
              id="design-property-area"
              type="number"
              min="0"
              step="0.01"
              value={propertyArea}
              disabled={disabled}
              placeholder="例如：120"
              onChange={(event) => onPropertyAreaChange(event.target.value)}
            />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="design-property-layout">户型</FieldLabel>
            <Input
              id="design-property-layout"
              value={propertyLayout}
              disabled={disabled}
              placeholder="例如：三室两厅"
              onChange={(event) => onPropertyLayoutChange(event.target.value)}
            />
          </Field>
        </FieldGroup>
      ) : (
        <div className="grid gap-2 text-sm md:grid-cols-3">
          <InfoItem label="小区" value={existingProperty?.community || customer.community || "-"} />
          <InfoItem label="楼栋门牌" value={existingProperty?.building_info || customer.building_info || "-"} />
          <InfoItem
            label="面积户型"
            value={[
              existingProperty?.area != null ? `${existingProperty.area}㎡` : customer.area != null ? `${customer.area}㎡` : null,
              existingProperty?.layout || customer.layout,
            ].filter(Boolean).join(" · ") || "-"}
          />
        </div>
      )}
    </section>
  );
}

export function DesignProjectFields({
  disabled,
  loadingOptions,
  name,
  designerId,
  supervisorId,
  budget,
  startDate,
  styleTags,
  address,
  designers,
  supervisors,
  onNameChange,
  onDesignerIdChange,
  onSupervisorIdChange,
  onBudgetChange,
  onStartDateChange,
  onStyleTagsChange,
  onAddressChange,
}: {
  disabled: boolean;
  loadingOptions: boolean;
  name: string;
  designerId: string;
  supervisorId: string;
  budget: string;
  startDate: string;
  styleTags: string;
  address: string;
  designers: ProjectEmployeeOption[];
  supervisors: ProjectEmployeeOption[];
  onNameChange: (value: string) => void;
  onDesignerIdChange: (value: string) => void;
  onSupervisorIdChange: (value: string) => void;
  onBudgetChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onStyleTagsChange: (value: string) => void;
  onAddressChange: (value: string) => void;
}) {
  return (
    <>
      <Field className="md:col-span-2">
        <FieldLabel htmlFor="design-project-name">项目名称</FieldLabel>
        <Input
          id="design-project-name"
          value={name}
          disabled={disabled}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="design-project-designer">设计师</FieldLabel>
        <FormSelect
          id="design-project-designer"
          value={designerId}
          disabled={disabled || loadingOptions}
          options={[
            { value: "__none__", label: loadingOptions ? "设计师加载中" : "暂不选择" },
            ...designers.map((item) => ({ value: item.id, label: item.label })),
          ]}
          onChange={onDesignerIdChange}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="design-project-supervisor">工程负责人</FieldLabel>
        <FormSelect
          id="design-project-supervisor"
          value={supervisorId}
          disabled={disabled || loadingOptions}
          options={[
            { value: "__none__", label: loadingOptions ? "负责人加载中" : "暂不选择" },
            ...supervisors.map((item) => ({ value: item.id, label: item.label })),
          ]}
          onChange={onSupervisorIdChange}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="design-project-budget">预算</FieldLabel>
        <Input
          id="design-project-budget"
          type="number"
          min="0"
          step="0.01"
          value={budget}
          disabled={disabled}
          onChange={(event) => onBudgetChange(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="design-project-start-date">开工日期</FieldLabel>
        <Input
          id="design-project-start-date"
          type="date"
          value={startDate}
          disabled={disabled}
          onChange={(event) => onStartDateChange(event.target.value)}
        />
      </Field>
      <Field className="md:col-span-2">
        <FieldLabel htmlFor="design-project-tags">风格标签</FieldLabel>
        <Input
          id="design-project-tags"
          value={styleTags}
          placeholder="现代,轻奢"
          disabled={disabled}
          onChange={(event) => onStyleTagsChange(event.target.value)}
        />
      </Field>
      <Field className="md:col-span-2">
        <FieldLabel htmlFor="design-project-address">项目地址</FieldLabel>
        <Textarea
          id="design-project-address"
          value={address}
          disabled={disabled}
          className="min-h-[72px]"
          onChange={(event) => onAddressChange(event.target.value)}
        />
      </Field>
    </>
  );
}
