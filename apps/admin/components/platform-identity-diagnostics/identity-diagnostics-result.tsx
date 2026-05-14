import { CopyValueButton } from "@/components/admin/copy-value-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  IdentityDiagnosticAuthEvent,
  IdentityDiagnosticData,
  IdentityDiagnosticIssue,
  IdentityDiagnosticMembership,
  IdentityDiagnosticOauthIdentity,
  IdentityDiagnosticSeverity,
} from "@/components/platform-identity-diagnostics/identity-diagnostics-types";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function statusVariant(status?: string | null) {
  if (status === "active" || status === "success") return "success" as const;
  if (status === "unbound" || status === "disabled" || status === "suspended") return "warning" as const;
  if (status === "failure") return "danger" as const;
  return "outline" as const;
}

function severityVariant(severity: IdentityDiagnosticSeverity) {
  if (severity === "danger") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  return "success" as const;
}

function severityLabel(severity: IdentityDiagnosticSeverity) {
  if (severity === "danger") return "需处理";
  if (severity === "warning") return "需关注";
  return "正常";
}

function typeLabel(type: string) {
  if (type === "phone") return "手机号";
  if (type === "openid") return "微信 openid";
  if (type === "user_id") return "user_id / 档案 ID";
  return "未识别";
}

function ShortValue({
  value,
  muted,
}: {
  value?: string | null;
  muted?: boolean;
}) {
  if (!value) return <span className="text-muted-foreground">-</span>;
  return (
    <span className={muted ? "truncate text-xs text-muted-foreground" : "truncate"}>
      {value}
    </span>
  );
}

function ValueCell({ value }: { value?: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ShortValue value={value} />
      {value ? <CopyValueButton value={value} label="复制" /> : null}
    </div>
  );
}

function JsonPreview({ value }: { value: unknown }) {
  if (value == null) return <span className="text-muted-foreground">-</span>;
  return (
    <pre className="max-h-28 overflow-auto rounded-md bg-muted p-2 text-xs leading-5 text-muted-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function EmptyRows({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-28">
        <Empty className="border-0 p-2">
          <EmptyHeader>
            <EmptyTitle>暂无数据</EmptyTitle>
            <EmptyDescription>{text}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </TableCell>
    </TableRow>
  );
}

function IssueList({ issues }: { issues: IdentityDiagnosticIssue[] }) {
  if (issues.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>一致性检查</CardTitle>
          <CardDescription>没有发现阻塞项。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>一致性检查</CardTitle>
        <CardDescription>优先处理红色问题，黄色问题用于灰度观察。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {issues.map((issue) => (
          <div key={`${issue.code}:${issue.related_user_id || ""}:${issue.related_identity_id || ""}`} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={severityVariant(issue.severity)}>
                {severityLabel(issue.severity)}
              </Badge>
              <span className="font-medium">{issue.title}</span>
              <span className="text-xs text-muted-foreground">{issue.code}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{issue.description}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {issue.related_user_id ? <span>user: {issue.related_user_id}</span> : null}
              {issue.related_identity_id ? <span>identity: {issue.related_identity_id}</span> : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AuthUsersTable({ data }: { data: IdentityDiagnosticData }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>user_id</TableHead>
          <TableHead>邮箱 / 手机</TableHead>
          <TableHead>创建时间</TableHead>
          <TableHead>最近登录</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.auth_users.length === 0 ? <EmptyRows colSpan={4} text="没有匹配到 auth user" /> : data.auth_users.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="min-w-[300px]"><ValueCell value={item.id} /></TableCell>
            <TableCell className="min-w-[220px]">
              <div className="flex flex-col gap-1">
                <ShortValue value={item.email} />
                <ShortValue value={item.phone} muted />
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(item.created_at)}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(item.last_sign_in_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OauthTable({
  oauthIdentities,
  emptyText,
}: {
  oauthIdentities: IdentityDiagnosticOauthIdentity[];
  emptyText: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>平台</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>user_id</TableHead>
          <TableHead>openid</TableHead>
          <TableHead>解绑时间</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {oauthIdentities.length === 0 ? <EmptyRows colSpan={5} text={emptyText} /> : oauthIdentities.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="whitespace-nowrap">{item.platform}</TableCell>
            <TableCell className="whitespace-nowrap"><Badge variant={statusVariant(item.status)}>{item.status}</Badge></TableCell>
            <TableCell className="min-w-[300px]"><ValueCell value={item.user_id} /></TableCell>
            <TableCell className="min-w-[260px]"><ValueCell value={item.openid} /></TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(item.unbound_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LegacyWechatTable({ data }: { data: IdentityDiagnosticData }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>auth_user_id</TableHead>
          <TableHead>openid</TableHead>
          <TableHead>unionid</TableHead>
          <TableHead>创建时间</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.legacy_wechat_identities.length === 0 ? <EmptyRows colSpan={4} text="没有匹配到旧微信映射" /> : data.legacy_wechat_identities.map((item) => (
          <TableRow key={`${item.auth_user_id}:${item.openid}`}>
            <TableCell className="min-w-[300px]"><ValueCell value={item.auth_user_id} /></TableCell>
            <TableCell className="min-w-[260px]"><ValueCell value={item.openid} /></TableCell>
            <TableCell className="min-w-[220px]"><ShortValue value={item.unionid} /></TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(item.created_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MembershipsTable({
  data,
  memberships,
  emptyText,
}: {
  data: IdentityDiagnosticData;
  memberships: IdentityDiagnosticMembership[];
  emptyText: string;
}) {
  const tenantName = new Map(data.tenants.map((tenant) => [tenant.id, tenant.name || tenant.slug || tenant.id]));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>业务身份</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>user_id</TableHead>
          <TableHead>identity_id</TableHead>
          <TableHead>租户</TableHead>
          <TableHead>默认</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {memberships.length === 0 ? <EmptyRows colSpan={6} text={emptyText} /> : memberships.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="whitespace-nowrap">{item.identity_type}</TableCell>
            <TableCell className="whitespace-nowrap"><Badge variant={statusVariant(item.status)}>{item.status}</Badge></TableCell>
            <TableCell className="min-w-[300px]"><ValueCell value={item.user_id} /></TableCell>
            <TableCell className="min-w-[300px]"><ValueCell value={item.identity_id} /></TableCell>
            <TableCell className="min-w-[200px]"><ShortValue value={item.tenant_id ? tenantName.get(item.tenant_id) : "全局"} /></TableCell>
            <TableCell className="whitespace-nowrap">{item.is_default ? "是" : "否"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BusinessProfilesTable({ data }: { data: IdentityDiagnosticData }) {
  const tenantName = new Map(data.tenants.map((tenant) => [tenant.id, tenant.name || tenant.slug || tenant.id]));
  const rows = [
    ...data.customers.map((item) => ({ ...item, type: "customer" })),
    ...data.employees.map((item) => ({ ...item, type: "employee" })),
  ];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>类型</TableHead>
          <TableHead>名称 / 手机</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>档案 ID</TableHead>
          <TableHead>旧 user_id</TableHead>
          <TableHead>租户</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? <EmptyRows colSpan={6} text="没有匹配到客户或员工档案" /> : rows.map((item) => (
          <TableRow key={`${item.type}:${item.id}`}>
            <TableCell className="whitespace-nowrap">{item.type === "customer" ? "客户" : "员工"}</TableCell>
            <TableCell className="min-w-[180px]">
              <div className="flex flex-col gap-1">
                <ShortValue value={item.name} />
                <ShortValue value={item.phone} muted />
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap"><Badge variant={statusVariant(item.status)}>{item.status || "-"}</Badge></TableCell>
            <TableCell className="min-w-[300px]"><ValueCell value={item.id} /></TableCell>
            <TableCell className="min-w-[300px]"><ValueCell value={item.user_id} /></TableCell>
            <TableCell className="min-w-[200px]"><ShortValue value={item.tenant_id ? tenantName.get(item.tenant_id) : null} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EventsTable({ events }: { events: IdentityDiagnosticAuthEvent[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>事件</TableHead>
          <TableHead>user_id</TableHead>
          <TableHead>平台</TableHead>
          <TableHead>时间</TableHead>
          <TableHead>元数据</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.length === 0 ? <EmptyRows colSpan={5} text="没有匹配到身份事件" /> : events.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="min-w-[220px]">
              <div className="flex flex-col gap-1">
                <span className="font-medium">{item.event_type}</span>
                <span className="text-xs text-muted-foreground">{item.id}</span>
              </div>
            </TableCell>
            <TableCell className="min-w-[300px]"><ValueCell value={item.user_id} /></TableCell>
            <TableCell className="whitespace-nowrap">{item.platform || "-"}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(item.created_at)}</TableCell>
            <TableCell className="min-w-[320px]"><JsonPreview value={item.metadata} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function IdentityDiagnosticsResult({ data }: { data: IdentityDiagnosticData }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>识别类型</CardDescription>
            <CardTitle className="text-lg">{typeLabel(data.query.type)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>当前业务身份</CardDescription>
            <CardTitle className="text-lg">{data.summary.active_membership_count}</CardTitle>
            <p className="text-xs text-muted-foreground">历史 {data.summary.history_membership_count}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>当前 OAuth</CardDescription>
            <CardTitle className="text-lg">{data.summary.active_oauth_identity_count}</CardTitle>
            <p className="text-xs text-muted-foreground">历史 {data.summary.history_oauth_identity_count}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>风险项</CardDescription>
            <CardTitle className="text-lg">
              {data.summary.danger_count} / {data.summary.warning_count}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <IssueList issues={data.issues} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>排查结果</CardTitle>
              <CardDescription>查看登录凭证、业务身份、旧字段和最近事件。</CardDescription>
            </div>
            <Badge variant="outline">{data.query.keyword}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="current-memberships" className="flex flex-col gap-3">
            <div className="px-4">
              <TabsList className="flex flex-wrap justify-start">
                <TabsTrigger value="current-memberships">当前身份</TabsTrigger>
                <TabsTrigger value="history-memberships">历史身份</TabsTrigger>
                <TabsTrigger value="profiles">客户/员工</TabsTrigger>
                <TabsTrigger value="current-oauth">当前 OAuth</TabsTrigger>
                <TabsTrigger value="history-oauth">历史 OAuth</TabsTrigger>
                <TabsTrigger value="legacy">旧微信表</TabsTrigger>
                <TabsTrigger value="users">Auth Users</TabsTrigger>
                <TabsTrigger value="events">事件</TabsTrigger>
              </TabsList>
            </div>
            <Separator />
            <TabsContent value="current-memberships" className="mt-0 overflow-x-auto">
              <MembershipsTable data={data} memberships={data.current.memberships} emptyText="没有当前有效业务身份" />
            </TabsContent>
            <TabsContent value="history-memberships" className="mt-0 overflow-x-auto">
              <MembershipsTable data={data} memberships={data.history.memberships} emptyText="没有历史解绑业务身份" />
            </TabsContent>
            <TabsContent value="profiles" className="mt-0 overflow-x-auto">
              <BusinessProfilesTable data={data} />
            </TabsContent>
            <TabsContent value="current-oauth" className="mt-0 overflow-x-auto">
              <OauthTable oauthIdentities={data.current.oauth_identities} emptyText="没有当前 active OAuth 凭证" />
            </TabsContent>
            <TabsContent value="history-oauth" className="mt-0 overflow-x-auto">
              <OauthTable oauthIdentities={data.history.oauth_identities} emptyText="没有历史 OAuth 凭证" />
            </TabsContent>
            <TabsContent value="legacy" className="mt-0 overflow-x-auto">
              <LegacyWechatTable data={data} />
            </TabsContent>
            <TabsContent value="users" className="mt-0 overflow-x-auto">
              <AuthUsersTable data={data} />
            </TabsContent>
            <TabsContent value="events" className="mt-0 overflow-x-auto">
              <EventsTable events={data.auth_events} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
