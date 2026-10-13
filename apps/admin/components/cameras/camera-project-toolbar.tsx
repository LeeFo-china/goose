"use client";

import { ProjectStatusConfig } from '@gooes/domain';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CameraProjectFilters } from './camera-project-filters';

export function CameraProjectToolbar({ filters }: { filters: CameraProjectFilters }) {
  return (
    <form action="/cameras" className="grid shrink-0 items-end gap-3 border-b px-4 py-3 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_10rem_10rem_auto]">
      <div className="grid gap-1.5">
        <Label htmlFor="camera-keyword">查找项目</Label>
        <Input id="camera-keyword" name="camera_keyword" maxLength={100} defaultValue={filters.keyword} placeholder="项目、客户、手机号、小区或房号" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="camera-binding">绑定情况</Label>
        <Select name="binding" defaultValue={filters.binding}>
          <SelectTrigger id="camera-binding"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="bound">已绑定</SelectItem>
            <SelectItem value="unbound">未绑定</SelectItem>
            <SelectItem value="all">全部项目</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="camera-project-status">项目状态</Label>
        <Select name="project_status" defaultValue={filters.status || 'all'}>
          <SelectTrigger id="camera-project-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(ProjectStatusConfig).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex h-10 items-center gap-2">
        <Button type="submit"><Search data-icon="inline-start" />查询</Button>
        {(filters.keyword || filters.binding !== 'bound' || filters.status) ? <Button variant="ghost" asChild><Link href="/cameras">重置</Link></Button> : null}
      </div>
    </form>
  );
}
