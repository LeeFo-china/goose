"use client";

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { projectStatusBadgeVariant, projectStatusLabel } from '@/components/projects/project-mutation-utils';
import { CreateCameraButton } from './camera-mutations';
import { canBindCameraToProject } from './camera-mutation-shared';
import { CameraProjectDevices } from './camera-project-devices';
import type { CameraProjectGroup } from './camera-types';

export function CameraProjectsTable({ groups }: { groups: CameraProjectGroup[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return (
    <Table className="min-w-[850px]" containerClassName="flex-1">
      <TableHeader className="sticky top-0 z-10 bg-muted">
        <TableRow><TableHead className="w-[35%]">项目</TableHead><TableHead>客户</TableHead><TableHead>项目状态</TableHead><TableHead>摄像头</TableHead><TableHead title="最近记录的设备状态，展开设备可刷新状态">最近监控状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {groups.map(group => {
          const expanded = expandedId === group.project.id;
          const summary = group.summary;
          const bound = summary.camera_count > 0;
          const project = group.project;
          return <Fragment key={project.id}>
            <TableRow data-testid={`camera-project-${project.id}`}>
              <TableCell><Link href={`/projects/${project.id}`} className="block max-w-[30rem] break-words font-medium hover:underline">{project.address || project.name || '未命名项目'}</Link></TableCell>
              <TableCell className="whitespace-nowrap">{project.customer_name || '未关联客户'}</TableCell>
              <TableCell className="whitespace-nowrap"><Badge variant={projectStatusBadgeVariant(project.status)}>{projectStatusLabel(project.status)}</Badge></TableCell>
              <TableCell>{bound ? <Button variant="ghost" size="sm" aria-expanded={expanded} aria-controls={`project-devices-${project.id}`} onClick={() => setExpandedId(expanded ? null : project.id)}>{expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}{summary.camera_count} 台<span className="sr-only">摄像头，{expanded ? '收起设备' : '查看设备'}</span></Button> : <span className="text-muted-foreground">未绑定</span>}</TableCell>
              <TableCell><div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                {!bound ? <span className="text-muted-foreground">尚未配置监控</span> : <>
                  <span>在线 {summary.online_count}</span>
                  {summary.offline_count > 0 ? <Badge variant="danger">离线 {summary.offline_count}</Badge> : null}
                  {summary.unknown_count > 0 ? <span className="text-muted-foreground">未知 {summary.unknown_count}</span> : null}
                </>}
              </div></TableCell>
              <TableCell className="text-right whitespace-nowrap">{canBindCameraToProject(project) ? <CreateCameraButton projectId={project.id} project={project} devices={[]} label={bound ? '增加摄像头' : '添加首台摄像头'} /> : <span className="text-xs text-muted-foreground">当前状态不可新增</span>}</TableCell>
            </TableRow>
            {expanded ? <TableRow className="hover:bg-transparent"><TableCell colSpan={6} className="bg-muted/20 p-0"><div id={`project-devices-${project.id}`}><CameraProjectDevices group={group} /></div></TableCell></TableRow> : null}
          </Fragment>;
        })}
      </TableBody>
    </Table>
  );
}
