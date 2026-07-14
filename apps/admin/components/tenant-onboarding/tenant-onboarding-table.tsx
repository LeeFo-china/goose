import { ClipboardX } from "lucide-react";

import { TenantOnboardingApplicationActions } from "@/components/tenant-onboarding/tenant-onboarding-actions";
import {
  applicationStatusMeta,
  assistStatusMeta,
  formatDateTime,
  formatRegion,
  type TenantOnboardingApplicationListRecord,
} from "@/components/tenant-onboarding/tenant-onboarding-types";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";

export function TenantOnboardingTable({
  applications,
}: {
  applications: TenantOnboardingApplicationListRecord[];
}) {
  return (
    <Table containerClassName="min-w-[1040px] overflow-visible">
      <TableHeader className="sticky top-0 bg-card">
        <TableRow>
          <TableHead className="w-[152px]">申请编号</TableHead>
          <TableHead className="min-w-[210px]">装修公司</TableHead>
          <TableHead className="w-[150px]">所在区域</TableHead>
          <TableHead className="w-[170px]">提交时间</TableHead>
          <TableHead className="min-w-[170px]">城市合伙人</TableHead>
          <TableHead className="w-[120px]">协查状态</TableHead>
          <TableHead className="w-[100px]">申请状态</TableHead>
          <TableHead className="sticky right-0 w-[112px] bg-card text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {applications.length ? applications.map((application) => {
          const partner = application.final_partner ?? application.candidate_partner;
          const applicationMeta = applicationStatusMeta[application.status];
          const assistMeta = assistStatusMeta[application.partner_assist_status];
          return (
            <TableRow key={application.id} className={`group ${PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}`}>
              <TableCell className="font-medium tabular-nums">
                {application.application_no}
              </TableCell>
              <TableCell>
                <div className="max-w-[280px] truncate font-semibold">
                  {application.company_name}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  管理员：{application.admin_name}
                </div>
              </TableCell>
              <TableCell>
                <div>{formatRegion(application)}</div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {application.service_region_codes.length} 个服务区域
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {formatDateTime(application.created_at)}
              </TableCell>
              <TableCell>
                <div className="max-w-[190px] truncate">{partner?.name || "待归因"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {application.final_partner ? "最终归因" : application.candidate_partner ? "候选归因" : "暂无候选"}
                </div>
              </TableCell>
              <TableCell><Badge variant={assistMeta.variant}>{assistMeta.label}</Badge></TableCell>
              <TableCell><Badge variant={applicationMeta.variant}>{applicationMeta.label}</Badge></TableCell>
              <TableCell className="sticky right-0 bg-card text-right group-hover:bg-muted/40">
                <TenantOnboardingApplicationActions application={application} />
              </TableCell>
            </TableRow>
          );
        }) : (
          <TableRow>
            <TableCell colSpan={8} className="p-0">
              <Empty className="min-h-52 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><ClipboardX /></EmptyMedia>
                  <EmptyTitle>暂无入驻申请</EmptyTitle>
                  <EmptyDescription>调整筛选条件，或等待装修公司提交新的入驻资料。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
