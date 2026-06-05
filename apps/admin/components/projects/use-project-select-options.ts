"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Option,
  ProjectRecord,
  PropertyOption,
} from "@/components/projects/project-mutation-types";
import {
  customerName,
  personName,
  propertyLabel,
  relationOne,
  requestProject,
} from "@/components/projects/project-mutation-utils";

type ProjectCreateListResponse<T> = {
  list?: T[];
};

type CustomerOptionRow = {
  id: string;
  name?: string | null;
  phone_masked?: string | null;
};

type EmployeeOptionRow = {
  id: string;
  name?: string | null;
  phone?: string | null;
  post_name?: string | null;
  department_name?: string | null;
};

type PropertyOptionRow = {
  id: string;
  customer_id?: string | null;
  community?: string | null;
  building_info?: string | null;
  area?: number | null;
  layout?: string | null;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  adcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_status?: string | null;
  location_source?: string | null;
  location_confidence?: number | null;
  location_confirmed_at?: string | null;
};

export function useSelectOptions(
  open: boolean,
  project: ProjectRecord | undefined,
  customerId: string,
) {
  const [customers, setCustomers] = useState<Option[]>([]);
  const [designers, setDesigners] = useState<Option[]>([]);
  const [supervisors, setSupervisors] = useState<Option[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [error, setError] = useState("");
  const [propertiesError, setPropertiesError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      requestProject<ProjectCreateListResponse<CustomerOptionRow>>({
        path: "/projects/create/customers?page=1&pageSize=80",
      }),
      requestProject<ProjectCreateListResponse<EmployeeOptionRow>>({
        path: "/projects/create/employees?scene=project_designer&page=1&pageSize=80",
      }),
      requestProject<ProjectCreateListResponse<EmployeeOptionRow>>({
        path: "/projects/create/employees?scene=project_supervisor&page=1&pageSize=80",
      }),
    ])
      .then(([customerData, designerData, supervisorData]) => {
        if (cancelled) return;
        setCustomers((customerData?.list || []).map((item) => ({
          id: item.id,
          label: item.name || item.phone_masked || item.id,
          description: item.phone_masked || null,
        })));
        setDesigners((designerData?.list || []).map((item) => ({
          id: item.id,
          label: item.name || item.phone || item.id,
          description: item.post_name || item.department_name || null,
        })));
        setSupervisors((supervisorData?.list || []).map((item) => ({
          id: item.id,
          label: item.name || item.phone || item.id,
          description: item.post_name || item.department_name || null,
        })));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "选项加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !customerId) {
      setProperties([]);
      setPropertiesError("");
      return;
    }

    let cancelled = false;
    setPropertiesLoading(true);
    setPropertiesError("");
    requestProject<ProjectCreateListResponse<PropertyOptionRow>>({
      path: `/projects/create/properties?customer_id=${customerId}&page=1&pageSize=80`,
    })
      .then((propertyData) => {
        if (cancelled) return;
        setProperties((propertyData?.list || []).map((item) => ({
          ...item,
          id: item.id,
          label: [item.community, item.building_info].filter(Boolean).join(" ") || item.id,
          description: [
            item.layout,
            item.area != null ? `${item.area}㎡` : null,
            item.location_status === "confirmed" ? "已确认" : null,
          ].filter(Boolean).join(" · ") || null,
        })));
      })
      .catch((err) => {
        if (!cancelled) {
          setPropertiesError(err instanceof Error ? err.message : "房产加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setPropertiesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, customerId]);

  const customerFallback = useMemo(() => {
    const customer = relationOne(project?.customer);
    return customer?.id ? {
      id: customer.id,
      label: customerName(customer),
      description: customer.phone_masked || customer.phone || null,
    } : null;
  }, [project]);
  const designerFallback = useMemo(() => {
    const designer = relationOne(project?.designer);
    return designer?.id ? {
      id: designer.id,
      label: personName(designer),
      description: null,
    } : null;
  }, [project]);
  const supervisorFallback = useMemo(() => {
    const supervisor = relationOne(project?.supervisor);
    return supervisor?.id ? {
      id: supervisor.id,
      label: personName(supervisor),
      description: null,
    } : null;
  }, [project]);
  const propertyFallback = useMemo(() => {
    const property = relationOne(project?.property);
    const propertyId = property?.id;
    return propertyId ? {
      ...property,
      id: propertyId,
      label: propertyLabel(property),
      description: property.location_status === "confirmed" ? "已确认" : null,
    } : null;
  }, [project]);

  return {
    loading,
    propertiesLoading,
    error: [error, propertiesError].filter(Boolean).join("\n"),
    customers: mergeFallback(customers, customerFallback),
    designers: mergeFallback(designers, designerFallback),
    supervisors: mergeFallback(supervisors, supervisorFallback),
    properties: mergeFallback(properties, propertyFallback),
  };
}

function mergeFallback<TOption extends Option>(options: TOption[], fallback: TOption | null) {
  if (!fallback || options.some((item) => item.id === fallback.id)) return options;
  return [fallback, ...options];
}
