export type ApiResponse<T> = {
    data: T;
    error?: any;
    message?: string;
};

/**
 * 首页基础统计数据
 */
export interface HomeDashboardSummary {
    month_revenue: number; // 本月营收
    active_projects: number; // 活跃项目数
}

/**
 * 客户简要信息（用于首页列表）
 */
export interface LatestCustomer {
    id: string;
    name: string;
    phone: string;
    status: string;
    created_at: string;
    owner_name: string; // 对应 RPC 中的 e.name
}

/**
 * 项目简要信息（用于首页列表）
 */
export interface LatestProject {
    id: string;
    name: string;
    budget: number;
    status: string;
    created_at: string;
    customer_name: string; // 对应 RPC 中的 c.name
    community: string; // 对应 RPC 中的 pr.community
}

/**
 * RPC get_home_dashboard_stats 的完整返回结构
 */
export interface HomeStatsResponse {
    stats: HomeDashboardSummary;
    latest_customers: LatestCustomer[];
    latest_projects: LatestProject[];
}
