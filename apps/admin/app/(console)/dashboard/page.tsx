import {
  BadgeCheck,
  BriefcaseBusiness,
  Camera,
  CircleDollarSign,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";

const modules = [
  {
    title: "客户管理",
    description: "客户档案、跟进记录、隐私号码权限。",
    icon: Users,
    status: "已规划",
  },
  {
    title: "项目管理",
    description: "项目资料、日志、施工进度和业主可见内容。",
    icon: BriefcaseBusiness,
    status: "已规划",
  },
  {
    title: "费用审批",
    description: "报销、付款、审批链和待办流转。",
    icon: CircleDollarSign,
    status: "已规划",
  },
  {
    title: "工地监控",
    description: "萤石设备下拉、摄像头绑定和播放配置。",
    icon: Camera,
    status: "已规划",
  },
];

export default async function DashboardPage() {
  const session = await getAdminSession();

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">后台概览</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            当前登录员工：{session?.employee.name || "未命名"}，已加载 {session?.permissions.length || 0} 项有效权限。
          </p>
        </div>
        <Badge variant="outline" className="w-fit">
          {session?.login_channel || "admin_web"}
        </Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BadgeCheck className="h-4 w-4 text-emerald-600" />
              员工状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">在职</div>
            <p className="mt-1 text-sm text-muted-foreground">仅 active 员工可登录后台</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">角色数量</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{session?.roles.length || 0}</div>
            <p className="mt-1 text-sm text-muted-foreground">来自后端权限上下文</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">有效权限</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{session?.permissions.length || 0}</div>
            <p className="mt-1 text-sm text-muted-foreground">用于菜单和按钮级控制</p>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {modules.map((item) => (
          <Card key={item.title}>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <item.icon className="h-4 w-4" />
                </div>
                <Badge variant="secondary">{item.status}</Badge>
              </div>
              <CardTitle>{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              {item.description}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
