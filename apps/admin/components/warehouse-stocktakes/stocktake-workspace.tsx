'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { WarehouseStocktakeSettings } from '@gooes/domain';

import { StatusAlert } from '@/components/admin/status-alert';
import { useAdminSessionScope } from '@/components/layout/admin-session-scope';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import { readStocktake } from './stocktake-api';
import { useStocktakeCommand } from './stocktake-command';
import { StocktakeCounts } from './stocktake-counts';
import { StocktakeDetail, type StocktakeCountsSeed } from './stocktake-detail';
import { StocktakeDraft, type StocktakeDraftSeed } from './stocktake-draft';
import { StocktakeList } from './stocktake-list';
import { stocktakeAccess, stocktakeError, stocktakeFeatureEnabled, type StocktakeAccess } from './stocktake-rules';

export function StocktakeWorkspace({
  permissions,
  initialOrderId,
  employeeId,
}: {
  permissions: string[];
  initialOrderId?: string;
  employeeId: string;
}) {
  const session = useAdminSessionScope();
  const access = stocktakeAccess(permissions);
  if (!access.canRead)
    return (
      <StatusAlert tone="warning" title="暂无盘点查看权限">
        查看盘点单需要库存查看权限，请联系管理员。
      </StatusAlert>
    );
  if (!session) return <StatusAlert tone="warning">正在确认当前会话，暂不能读取或执行盘点操作。</StatusAlert>;
  const scope = `${session.storageScope}:employee:${encodeURIComponent(employeeId)}`;
  return (
    <StocktakeWorkspaceSession
      key={`${scope}:${initialOrderId ?? ''}`}
      access={access}
      scope={scope}
      initialOrderId={initialOrderId}
    />
  );
}

function StocktakeWorkspaceSession({
  access,
  scope,
  initialOrderId,
}: {
  access: StocktakeAccess;
  scope: string;
  initialOrderId?: string;
}) {
  const [selected, setSelected] = useState(initialOrderId ?? '');
  const [draft, setDraft] = useState<StocktakeDraftSeed | null>(null);
  const [counts, setCounts] = useState<StocktakeCountsSeed | null>(null);
  const [revision, setRevision] = useState(0);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [settingsRetry, setSettingsRetry] = useState(0);
  const command = useStocktakeCommand(scope, (id) => {
    setDraft(null);
    setCounts(null);
    setSelected(id);
    setRevision((value) => value + 1);
  });
  useEffect(() => {
    const controller = new AbortController();
    setEnabled(null);
    setSettingsError('');
    readStocktake<WarehouseStocktakeSettings>('/warehouse-stocktakes/settings', controller.signal)
      .then((settings) => {
        if (controller.signal.aborted) return;
        const flag = stocktakeFeatureEnabled(settings);
        if (flag === null) setSettingsError('功能配置无效，暂不能写入');
        else setEnabled(flag);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setSettingsError(stocktakeError(caught));
      });
    return () => controller.abort();
  }, [settingsRetry]);
  const blocked = enabled !== true || !command.ready || command.busy || Boolean(command.pending);
  const execute = (path: string, body: object, id: string) => {
    const permitted = path.endsWith('/complete') ? access.canApprove : access.canManage;
    if (!blocked && permitted) void command.execute(path, body, id);
  };
  return (
    <div className="flex min-w-0 flex-col gap-4 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">仓库盘点</h1>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/inventory">仓库库存</Link>
          </Button>
          {access.canManage && (
            <Button
              size="sm"
              disabled={blocked || Boolean(draft) || Boolean(counts)}
              onClick={() => {
                setSelected('');
                setDraft({ id: crypto.randomUUID(), items: [] });
              }}
            >
              新建盘点
            </Button>
          )}
        </div>
      </div>
      {enabled !== true && (
        <StatusAlert
          tone="warning"
          title={
            settingsError ? '功能配置读取失败' : enabled === false ? '仓库盘点功能未开启' : '正在确认功能配置'
          }
        >
          {settingsError || '历史盘点单仍可查看，当前不能保存、提交、完成或取消。'}
          {settingsError && (
            <Button variant="link" onClick={() => setSettingsRetry((value) => value + 1)}>
              重试功能配置
            </Button>
          )}
        </StatusAlert>
      )}
      {command.message && (
        <StatusAlert tone={command.message.startsWith('操作已成功') ? 'success' : 'warning'}>
          {command.message}
          {command.message.includes('版本') && <p>已重新读取最新版本，请核对后再次确认操作。</p>}
        </StatusAlert>
      )}
      {!access.canManage && !access.canApprove && (
        <p className="text-sm text-muted-foreground">
          当前为只读权限；保存、开始、录入、提交和取消需要盘点管理权限，完成需要盘点审批权限。
        </p>
      )}
      {command.pending && (
        <StatusAlert tone="warning" title={command.busy ? '正在执行盘点操作' : '上次请求结果尚未确认'}>
          <p>单据 {command.pending.orderId}。原请求已锁定；请重试原请求确认结果，再进行其他操作。</p>
          <Button disabled={command.busy} variant="outline" onClick={() => void command.execute()}>
            重试原请求
          </Button>
        </StatusAlert>
      )}
      {counts ? (
        <StocktakeCounts
          key={counts.order.id}
          order={counts.order}
          items={counts.items}
          disabled={blocked || !access.canManage}
          onSave={execute}
          onClose={() => setCounts(null)}
        />
      ) : draft ? (
        <StocktakeDraft
          key={draft.id}
          seed={draft}
          access={access}
          disabled={blocked}
          onSave={execute}
          onClose={() => setDraft(null)}
        />
      ) : selected ? (
        <>
          <div>
            <Button variant="ghost" onClick={() => setSelected('')}>
              返回列表
            </Button>
          </div>
          <StocktakeDetail
            key={selected}
            id={selected}
            revision={revision}
            access={access}
            disabled={blocked}
            onDraft={setDraft}
            onCounts={setCounts}
            onCommand={execute}
          />
        </>
      ) : (
        <StocktakeList access={access} revision={revision} onOpen={setSelected} />
      )}
      <Separator />
      <p className="text-xs text-muted-foreground">
        开始盘点冻结账面快照；完成盘点按实盘差异调整仓库库存，不生成项目成本、供应商应付或付款记录。
      </p>
    </div>
  );
}
