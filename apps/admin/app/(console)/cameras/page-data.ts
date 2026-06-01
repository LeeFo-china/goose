import type {
  CameraProjectGroup,
  CameraProjectOption,
  Pagination,
  TenantDeviceAsset,
} from "@/components/cameras/camera-types";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type ProjectListData = {
  list: Array<{
    id: string;
    name: string | null;
    status?: string | null;
    address?: string | null;
    customer?: {
      name?: string | null;
      phone_masked?: string | null;
      phone?: string | null;
    } | Array<{
      name?: string | null;
      phone_masked?: string | null;
      phone?: string | null;
    }> | null;
  }>;
  pagination: Pagination;
};

type TenantDeviceListData = {
  list: TenantDeviceAsset[];
  pagination: Pagination;
};

export type CamerasPageSearchParams = {
  project_id?: string;
  camera_page?: string;
  camera_keyword?: string;
};

type CameraProjectGroupsData = {
  list: CameraProjectGroup[];
  pagination: Pagination;
  summary: {
    project_count: number;
    total_camera_count: number;
    online_count: number;
    hidden_count: number;
    tencent_count: number;
  };
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function customerName(project: ProjectListData["list"][number]) {
  const customer = relationOne(project.customer);
  return customer?.name || customer?.phone_masked || customer?.phone || null;
}

async function fetchBackendData<T>(token: string, path: string) {
  const response = await fetch(buildBackendUrl(path), {
    headers: {
      authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const payload = await parseBackendJson<T>(response);
  return payload.data as T;
}

export async function getProjects(token: string | null) {
  if (!token) {
    return {
      list: [] as CameraProjectOption[],
      error: "缺少登录凭证",
    };
  }

  try {
    const data = await fetchBackendData<ProjectListData>(
      token,
      "/projects?page=1&pageSize=100",
    );
    return {
      list: (data?.list || []).map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status || null,
        customer_name: customerName(project),
        address: project.address || null,
      })),
      error: null,
    };
  } catch (error) {
    return {
      list: [] as CameraProjectOption[],
      error: error instanceof Error ? error.message : "项目列表加载失败",
    };
  }
}

export async function getCameraProjectGroups(input: {
  token: string | null;
  page: number;
  keyword: string;
}) {
  if (!input.token) {
    return {
      list: [] as CameraProjectGroup[],
      pagination: { page: input.page, pageSize: 5, total: 0, totalPages: 0 },
      summary: {
        project_count: 0,
        total_camera_count: 0,
        online_count: 0,
        hidden_count: 0,
        tencent_count: 0,
      },
      error: "缺少登录凭证",
    };
  }

  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: "5",
  });
  if (input.keyword) params.set("keyword", input.keyword);

  try {
    const data = await fetchBackendData<CameraProjectGroupsData>(
      input.token,
      `/project-cameras/projects?${params.toString()}`,
    );
    return {
      list: data?.list || [],
      pagination: data?.pagination || { page: input.page, pageSize: 5, total: 0, totalPages: 0 },
      summary: data?.summary || {
        project_count: 0,
        total_camera_count: 0,
        online_count: 0,
        hidden_count: 0,
        tencent_count: 0,
      },
      error: null,
    };
  } catch (error) {
    return {
      list: [] as CameraProjectGroup[],
      pagination: { page: input.page, pageSize: 5, total: 0, totalPages: 0 },
      summary: {
        project_count: 0,
        total_camera_count: 0,
        online_count: 0,
        hidden_count: 0,
        tencent_count: 0,
      },
      error: error instanceof Error ? error.message : "项目摄像头加载失败",
    };
  }
}

export async function getTenantDevices(token: string | null) {
  if (!token) {
    return {
      list: [] as TenantDeviceAsset[],
      error: "缺少登录凭证",
    };
  }

  try {
    const data = await fetchBackendData<TenantDeviceListData>(
      token,
      "/tenant-devices?page=1&pageSize=100",
    );
    return {
      list: data?.list || [],
      error: null,
    };
  } catch (error) {
    return {
      list: [] as TenantDeviceAsset[],
      error: error instanceof Error ? error.message : "租户设备资产加载失败",
    };
  }
}

export function buildCameraPageHref(input: {
  page: number;
  keyword: string;
}) {
  const params = new URLSearchParams();
  if (input.page > 1) params.set("camera_page", String(input.page));
  if (input.keyword) params.set("camera_keyword", input.keyword);
  const query = params.toString();
  return query ? `/cameras?${query}` : "/cameras";
}
