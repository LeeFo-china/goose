"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DesignProjectContextInfo,
  DesignProjectFields,
  DesignProjectPropertySection,
} from "@/components/customers/design-project-before-status-fields";
import type { CustomerRecord, ProjectEmployeeOption } from "@/components/customers/customer-mutation-types";
import { getPrimaryCustomerProperty, requestCustomer, syncProjectPrimaryMembers } from "@/components/customers/customer-mutation-shared";

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
            <DesignProjectContextInfo
              customer={customer}
              propertyName={propertyName}
              existingPropertyId={existingPropertyId}
            />
            <DesignProjectPropertySection
              needsProperty={needsProperty}
              disabled={disabled}
              existingProperty={existingProperty}
              customer={customer}
              propertyCommunity={propertyCommunity}
              propertyBuildingInfo={propertyBuildingInfo}
              propertyArea={propertyArea}
              propertyLayout={propertyLayout}
              onPropertyCommunityChange={setPropertyCommunity}
              onPropertyBuildingInfoChange={setPropertyBuildingInfo}
              onPropertyAreaChange={setPropertyArea}
              onPropertyLayoutChange={setPropertyLayout}
            />
            <DesignProjectFields
              disabled={disabled}
              loadingOptions={loadingOptions}
              name={name}
              designerId={designerId}
              supervisorId={supervisorId}
              budget={budget}
              startDate={startDate}
              styleTags={styleTags}
              address={address}
              designers={designers}
              supervisors={supervisors}
              onNameChange={setName}
              onDesignerIdChange={setDesignerId}
              onSupervisorIdChange={setSupervisorId}
              onBudgetChange={setBudget}
              onStartDateChange={setStartDate}
              onStyleTagsChange={setStyleTags}
              onAddressChange={setAddress}
            />
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
