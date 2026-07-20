import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { platformTabsListClassName, platformTabsTriggerClassName } from "@/components/platform/platform-tabs";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AuthUsersTable,
  BusinessProfilesTable,
  EventsTable,
  IdentityDiagnosticsSummaryCards,
  IssueList,
  LegacyWechatTable,
  MembershipsTable,
  OauthTable,
} from "@/components/platform-identity-diagnostics/identity-diagnostics-result-sections";
import type { IdentityDiagnosticData } from "@/components/platform-identity-diagnostics/identity-diagnostics-types";

export function IdentityDiagnosticsResult({ data }: { data: IdentityDiagnosticData }) {
  return (
    <div className="flex flex-col gap-4">
      <IdentityDiagnosticsSummaryCards data={data} />
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
              <TabsList className={platformTabsListClassName}>
                <TabsTrigger value="current-memberships" className={platformTabsTriggerClassName}>当前身份</TabsTrigger>
                <TabsTrigger value="history-memberships" className={platformTabsTriggerClassName}>历史身份</TabsTrigger>
                <TabsTrigger value="profiles" className={platformTabsTriggerClassName}>客户/员工</TabsTrigger>
                <TabsTrigger value="current-oauth" className={platformTabsTriggerClassName}>当前 OAuth</TabsTrigger>
                <TabsTrigger value="history-oauth" className={platformTabsTriggerClassName}>历史 OAuth</TabsTrigger>
                <TabsTrigger value="legacy" className={platformTabsTriggerClassName}>旧微信表</TabsTrigger>
                <TabsTrigger value="users" className={platformTabsTriggerClassName}>Auth Users</TabsTrigger>
                <TabsTrigger value="events" className={platformTabsTriggerClassName}>事件</TabsTrigger>
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
