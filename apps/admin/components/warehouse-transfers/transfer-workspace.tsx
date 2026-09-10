'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { WarehouseTransferSettings } from '@gooes/domain';

import { StatusAlert } from '@/components/admin/status-alert';
import { useAdminSessionScope } from '@/components/layout/admin-session-scope';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import { readTransfer } from './transfer-api';
import { useTransferCommand } from './transfer-command';
import { TransferDetail } from './transfer-detail';
import { TransferDraft, type TransferDraftSeed } from './transfer-draft';
import { INITIAL_TRANSFER_LIST_STATE, TransferList } from './transfer-list';
import { transferAccess, transferError, type TransferAccess } from './transfer-rules';

export function TransferWorkspace({ permissions, initialOrderId, employeeId }: { permissions: string[]; initialOrderId?: string; employeeId: string }) {
  const session = useAdminSessionScope(); const access = transferAccess(permissions);
  if (!access.canRead) return <StatusAlert tone="warning" title="暂无调拨查看权限">查看调拨单需要库存查看权限，请联系管理员。</StatusAlert>;
  if (!session) return <StatusAlert tone="warning">正在确认当前会话，暂不能读取或执行调拨操作。</StatusAlert>;
  const scope = `${session.storageScope}:employee:${encodeURIComponent(employeeId)}`;
  return <TransferWorkspaceSession key={`${scope}:${initialOrderId ?? ''}`} access={access} scope={scope} initialOrderId={initialOrderId} />;
}

function TransferWorkspaceSession({ access, scope, initialOrderId }: { access: TransferAccess; scope: string; initialOrderId?: string }) {
  const [selected, setSelected] = useState(initialOrderId ?? ''); const [draft, setDraft] = useState<TransferDraftSeed | null>(null);
  const [listState, setListState] = useState(INITIAL_TRANSFER_LIST_STATE);
  const [revision, setRevision] = useState(0); const [enabled, setEnabled] = useState<boolean | null>(null);
  const [settingsError, setSettingsError] = useState(''); const [settingsRetry, setSettingsRetry] = useState(0);
  const command = useTransferCommand(scope, (id) => { setDraft(null); setSelected(id); setRevision((value) => value + 1); });
  useEffect(() => {
    const controller = new AbortController(); setEnabled(null); setSettingsError('');
    readTransfer<WarehouseTransferSettings>('/warehouse-transfers/settings', controller.signal).then((settings) => {
      if (controller.signal.aborted) return;
      if (typeof settings?.warehouse_transfers_enabled !== 'boolean') setSettingsError('功能配置无效，暂不能写入');
      else setEnabled(settings.warehouse_transfers_enabled);
    }).catch((caught) => { if (!controller.signal.aborted) setSettingsError(transferError(caught)); });
    return () => controller.abort();
  }, [settingsRetry]);
  const blocked = enabled !== true || !command.ready || command.busy || Boolean(command.pending);
  const execute = (path: string, body: object, id: string) => { if (!blocked) void command.execute(path, body, id); };
  return <div className="flex min-w-0 flex-col gap-4 pb-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-lg font-semibold">仓库调拨</h1><div className="flex gap-2"><Button asChild size="sm" variant="outline"><Link href="/inventory">仓库库存</Link></Button>{access.canManage && <Button size="sm" disabled={blocked || Boolean(draft)} onClick={() => { if (draft) return; setSelected(''); setDraft({ id: crypto.randomUUID(), items: [] }); }}>新建调拨</Button>}</div></div>
    {enabled !== true && <StatusAlert tone="warning" title={settingsError ? '功能配置读取失败' : enabled === false ? '仓库调拨功能未开启' : '正在确认功能配置'}>{settingsError || '历史调拨单仍可查看，当前不能保存、提交、完成或取消。'}{settingsError && <Button variant="link" onClick={() => setSettingsRetry((value) => value + 1)}>重试功能配置</Button>}</StatusAlert>}
    {command.message && <StatusAlert tone={command.message.startsWith('操作已成功') ? 'success' : 'warning'}>{command.message}{command.message.includes('版本') && <p>已重新读取最新版本，请核对后再次确认操作。</p>}</StatusAlert>}
    {!access.canManage && !access.canApprove && <p className="text-sm text-muted-foreground">当前为只读权限；保存、提交和取消需要调拨管理权限，完成需要调拨审批权限。</p>}
    {command.pending && <StatusAlert tone="warning" title={command.busy ? '正在执行调拨操作' : '上次请求结果尚未确认'}><p>单据 {command.pending.orderId}。原请求已锁定；请重试原请求确认结果，再进行其他操作。</p><Button disabled={command.busy} variant="outline" onClick={() => void command.execute()}>重试原请求</Button></StatusAlert>}
    {draft ? <TransferDraft key={draft.id} seed={draft} access={access} disabled={blocked} onSave={execute} onClose={() => setDraft(null)} /> : selected ? <><div><Button variant="ghost" onClick={() => setSelected('')}>返回列表</Button></div><TransferDetail key={selected} id={selected} revision={revision} access={access} disabled={blocked} onDraft={setDraft} onCommand={execute} /></> : <TransferList access={access} revision={revision} onOpen={setSelected} state={listState} onChange={setListState} />}
    <Separator /><p className="text-xs text-muted-foreground">完成调拨会对两个仓库进行成对库存过账，不生成项目成本、供应商应付或付款记录。</p>
  </div>;
}
