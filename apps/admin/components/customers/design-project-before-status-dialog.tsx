"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerRecord, ProjectEmployeeOption } from "@/components/customers/customer-mutation-types";
import { getPrimaryCustomerProperty, InfoItem, requestCustomer, syncProjectPrimaryMembers } from "@/components/customers/customer-mutation-shared";

export function DesignProjectBeforeStatusDialog({
  open,
  customer,
  propertyName,
  pendingStatus,
  onOpenChange,
  onProjectCreated,
}: {
  open: boolean;
  customer: CustomerRecord;
  propertyName: string;
  pendingStatus: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: () => Promise<void>;
}) {
  const existingProperty = getPrimaryCustomerProperty(customer);
  const existingPropertyId = customer.property_id || existingProperty?.id || null;
  const defaultProjectName = useMemo(() => {
    const customerLabel = customer.name || customer.phone_masked || customer.phone || "未命名客户";
    return propertyName
      ? `${customerLabel} - ${propertyName}设计项目`
      : `${customerLabel}设计项目`;
  }, [customer.name, customer.phone, customer.phone_masked, propertyName]);
  const defaultAddress = propertyName || customer.community || "";
  const [name, setName] = useState(defaultProjectName);
  const [designerId, setDesignerId] = useState("__none__");
  const [supervisorId, setSupervisorId] = useState("__none__");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [address, setAddress] = useState(defaultAddress);
  const [styleTags, setStyleTags] = useState("");
  const [propertyCommunity, setPropertyCommunity] = useState(existingProperty?.community || "");
  const [propertyBuildingInfo, setPropertyBuildingInfo] = useState(existingProperty?.building_info || "");
  const [propertyArea, setPropertyArea] = useState(
    existingProperty?.area != null ? String(existingProperty.area) : "",
  );
  const [propertyLayout, setPropertyLayout] = useState(existingProperty?.layout || "");
  const [designers, setDesigners] = useState<ProjectEmployeeOption[]>([]);
  const [supervisors, setSupervisors] = useState<ProjectEmployeeOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(defaultProjectName);
    setDesignerId("__none__");
    setSupervisorId("__none__");
    setBudget("");
    setStartDate("");
    setAddress(defaultAddress);
    setStyleTags("");
    setPropertyCommunity(existingProperty?.community || "");
    setPropertyBuildingInfo(existingProperty?.building_info || "");
    setPropertyArea(existingProperty?.area != null ? String(existingProperty.area) : "");
    setPropertyLayout(existingProperty?.layout || "");
    setError("");
  }, [open, defaultProjectName, defaultAddress, existingProperty]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingOptions(true);
    Promise.all([
      requestCustomer({ path: "/projects/create/employees?scene=project_designer&page=1&pageSize=80" }),
      requestCustomer({ path: "/projects/create/employees?scene=project_supervisor&page=1&pageSize=80" }),
    ])
      .then(([designerData, supervisorData]) => {
        if (cancelled) return;
        setDesigners((designerData?.list || []).map((item: any) => ({
          id: item.id,
          label: item.name || item.phone || item.id,
          description: item.post_name || item.department_name || null,
        })));
        setSupervisors((supervisorData?.list || []).map((item: any) => ({
          id: item.id,
          label: item.name || item.phone || item.id,
          description: item.post_name || item.department_name || null,
        })));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "项目人员加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  function close() {
    if (pending || pendingStatus) return;
    onOpenChange(false);
  }

  async function ensurePrimaryProperty() {
    if (existingPropertyId) {
      if (customer.property_id !== existingPropertyId) {
        await requestCustomer({
          path: `/customers/${customer.id}/properties/${existingPropertyId}/primary`,
          method: "POST",
        });
      }
      return existingPropertyId;
    }

    const normalizedCommunity = propertyCommunity.trim();
    const normalizedArea = propertyArea.trim();
    if (!normalizedCommunity) {
      throw new Error("请先填写主房产小区名称");
    }
    if (normalizedArea) {
      const areaValue = Number(normalizedArea);
      if (!Number.isFinite(areaValue) || areaValue < 0) {
        throw new Error("请输入有效面积");
      }
    }

    const property = await requestCustomer({
      path: `/customers/${customer.id}/properties`,
      method: "POST",
      payload: {
        community: normalizedCommunity,
        building_info: propertyBuildingInfo.trim() || null,
        area: normalizedArea ? Number(normalizedArea) : null,
        layout: propertyLayout.trim() || null,
        latitude: null,
        longitude: null,
        set_as_primary: true,
      },
    });

    if (!property?.id) {
      throw new Error("主房产创建成功但未返回房产 ID");
    }
    return property.id as string;
  }

  function deriveProjectAddress() {
    const normalizedAddress = address.trim();
    if (normalizedAddress) return normalizedAddress;
    return [
      propertyCommunity.trim() || existingProperty?.community || customer.community,
      propertyBuildingInfo.trim() || existingProperty?.building_info || customer.building_info,
    ].filter(Boolean).join(" ") || null;
  }

  function submit() {
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("请输入项目名称");
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        const propertyId = await ensurePrimaryProperty();
        const tags = styleTags
          .split(/[,，\n]/)
          .map((item) => item.trim())
          .filter(Boolean);
        const project = await requestCustomer({
          path: "/projects",
          method: "POST",
          payload: {
            name: normalizedName,
            customer_id: customer.id,
            property_id: propertyId,
            budget: budget ? Number(budget) : null,
            start_date: startDate || null,
            address: deriveProjectAddress(),
            visibility_status: "inherit",
            style_tags: tags,
            status: "designing",
          },
        });
        if (!project?.id) {
          throw new Error("项目创建成功但未返回项目 ID");
        }
        await syncProjectPrimaryMembers({
          projectId: project.id as string,
          designerId: designerId === "__none__" ? null : designerId,
          supervisorId: supervisorId === "__none__" ? null : supervisorId,
        });
        await onProjectCreated();
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "创建项目或推进状态失败");
      }
    });
  }

  const disabled = pending || pendingStatus;
  const needsProperty = !existingPropertyId;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[88vh] max-w-[680px] overflow-hidden p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle>开始设计前创建项目</DialogTitle>
          <DialogDescription>
            先补齐主房产并创建项目，成功后系统会自动把客户推进到设计中。
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[calc(88vh-82px)] flex-col gap-4 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <InfoItem label="关联客户" value={customer.name || customer.phone_masked || customer.phone || "-"} />
            <InfoItem
              label="主房产"
              value={existingPropertyId ? propertyName || "已选择主房产" : "待补全"}
            />
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
                      onChange={(event) => setPropertyCommunity(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="design-property-building">楼栋门牌</FieldLabel>
                    <Input
                      id="design-property-building"
                      value={propertyBuildingInfo}
                      disabled={disabled}
                      placeholder="例如：12栋1单元1203"
                      onChange={(event) => setPropertyBuildingInfo(event.target.value)}
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
                      onChange={(event) => setPropertyArea(event.target.value)}
                    />
                  </Field>
                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor="design-property-layout">户型</FieldLabel>
                    <Input
                      id="design-property-layout"
                      value={propertyLayout}
                      disabled={disabled}
                      placeholder="例如：三室两厅"
                      onChange={(event) => setPropertyLayout(event.target.value)}
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
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="design-project-name">项目名称</FieldLabel>
              <Input
                id="design-project-name"
                value={name}
                disabled={disabled}
                onChange={(event) => setName(event.target.value)}
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
                onChange={setDesignerId}
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
                onChange={setSupervisorId}
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
                onChange={(event) => setBudget(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="design-project-start-date">开工日期</FieldLabel>
              <Input
                id="design-project-start-date"
                type="date"
                value={startDate}
                disabled={disabled}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="design-project-tags">风格标签</FieldLabel>
              <Input
                id="design-project-tags"
                value={styleTags}
                placeholder="现代,轻奢"
                disabled={disabled}
                onChange={(event) => setStyleTags(event.target.value)}
              />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="design-project-address">项目地址</FieldLabel>
              <Textarea
                id="design-project-address"
                value={address}
                disabled={disabled}
                className="min-h-[72px]"
                onChange={(event) => setAddress(event.target.value)}
              />
            </Field>
          </div>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={disabled} onClick={close}>
              取消
            </Button>
            <Button type="button" disabled={disabled} onClick={submit}>
              {disabled ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              创建项目并进入设计中
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
