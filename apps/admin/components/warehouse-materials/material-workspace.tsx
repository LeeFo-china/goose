'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  WarehouseMaterialDocumentType,
  WarehouseMaterialSettings,
} from '@gooes/domain';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { StatusAlert } from '@/components/admin/status-alert';
import { useAdminSessionScope } from '@/components/layout/admin-session-scope';
import { readMaterial } from './material-api';
import {
  materialAccess,
  materialBase,
  materialError,
  type MaterialAccess,
} from './material-rules';
import { useMaterialCommand } from './material-command';
import { MaterialList } from './material-list';
import { MaterialDetail } from './material-detail';
import { MaterialDraft, type MaterialDraftSeed } from './material-draft';

export function MaterialWorkspace({
  kind,
  permissions,
  initialOrderId,
  employeeId,
}: {
  kind: WarehouseMaterialDocumentType;
  permissions: string[];
  initialOrderId?: string;
  employeeId: string;
}) {
  const session = useAdminSessionScope();
  const access = materialAccess(permissions);
  if (!access.canRead)
    return (
      <StatusAlert tone="warning" title="暂无领退料查看权限">
        查看单据和成本需要库存查看与项目查看权限，请联系管理员。
      </StatusAlert>
    );
  if (!session)
    return (
      <StatusAlert tone="warning">
        正在确认当前会话，暂不能执行领退料操作。
      </StatusAlert>
    );
  const scope = `${session.storageScope}:employee:${encodeURIComponent(employeeId)}`;
  return (
    <MaterialWorkspaceSession
      key={`${scope}:${kind}:${initialOrderId ?? ''}`}
      kind={kind}
      access={access}
      scope={scope}
      initialOrderId={initialOrderId}
    />
  );
}

function MaterialWorkspaceSession({
  kind,
  access,
  scope,
  initialOrderId,
}: {
  kind: WarehouseMaterialDocumentType;
  access: MaterialAccess;
  scope: string;
  initialOrderId?: string;
}) {
  const [selected, setSelected] = useState(initialOrderId ?? '');
  const [draft, setDraft] = useState<MaterialDraftSeed | null>(null);
  const [revision, setRevision] = useState(0);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [settingsRetry, setSettingsRetry] = useState(0);
  const [selectedKind, setSelectedKind] = useState(kind);
  const command = useMaterialCommand(scope, (id, path) => {
    setSelectedKind(
      path.startsWith('/warehouse-returns/') ? 'return' : 'issue',
    );
    setDraft(null);
    setSelected(id);
    setRevision((value) => value + 1);
  });
  useEffect(() => {
    const controller = new AbortController();
    setEnabled(null);
    setSettingsError('');
    readMaterial<WarehouseMaterialSettings>(
      '/warehouse-issues/settings',
      controller.signal,
    )
      .then((settings) => {
        if (!controller.signal.aborted) {
          if (typeof settings?.warehouse_materials_enabled !== 'boolean') {
            setSettingsError('功能配置无效，暂不能写入');
            return;
          }
          setEnabled(settings.warehouse_materials_enabled);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setSettingsError(materialError(error));
      });
    return () => controller.abort();
  }, [settingsRetry]);
  const blocked =
    enabled !== true ||
    !command.ready ||
    command.busy ||
    Boolean(command.pending);
  const currentKind = draft?.kind ?? kind;
  const displayedKind = draft?.kind ?? (selected ? selectedKind : kind);
  const execute = (path: string, body: object, id: string) => {
    if (!blocked) void command.execute(path, body, id);
  };
  const saveDraft = (path: string, body: object, id: string) => {
    setSelectedKind(currentKind);
    execute(path, body, id);
  };
  return (
    <div className="flex min-w-0 flex-col gap-4 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          项目{displayedKind === 'issue' ? '领料' : '退料'}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/inventory">仓库库存</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link
              href={materialBase(
                displayedKind === 'issue' ? 'return' : 'issue',
              )}
            >
              {displayedKind === 'issue' ? '退料记录' : '领料记录'}
            </Link>
          </Button>
          {displayedKind === 'issue' && access.canManage && (
            <Button
              size="sm"
              disabled={blocked}
              onClick={() => {
                setSelected('');
                setDraft({ kind: 'issue', id: crypto.randomUUID(), items: [] });
              }}
            >
              新建领料
            </Button>
          )}
        </div>
      </div>
      {enabled !== true && (
        <StatusAlert
          tone="warning"
          title={
            settingsError
              ? '功能配置读取失败'
              : enabled === false
                ? '领退料功能未开启'
                : '正在确认功能配置'
          }
        >
          {settingsError ||
            '历史单据仍可查看，当前不能保存、提交、确认或取消。'}
          {settingsError && (
            <Button
              variant="link"
              onClick={() => setSettingsRetry((value) => value + 1)}
            >
              重试功能配置
            </Button>
          )}
        </StatusAlert>
      )}
      {command.message && (
        <StatusAlert
          tone={
            command.message.startsWith('操作已成功') ? 'success' : 'warning'
          }
        >
          {command.message}
          {command.message.includes('版本') && (
            <p>已重新读取最新版本，请核对后再次确认操作。</p>
          )}
        </StatusAlert>
      )}
      {!access.canManage && !access.canApprove && (
        <p className="text-sm text-muted-foreground">
          当前为只读权限；保存、提交和取消需要领料管理权限，确认出入库需要领料确认权限。
        </p>
      )}
      {command.pending && (
        <StatusAlert
          tone="warning"
          title={command.busy ? '正在执行单据操作' : '上次请求结果尚未确认'}
        >
          <p>
            单据 {command.pending.orderId}
            。原请求已锁定；请重试原请求确认结果，再进行其他操作。
          </p>
          <Button
            disabled={command.busy}
            variant="outline"
            onClick={() => void command.execute()}
          >
            重试原请求
          </Button>
        </StatusAlert>
      )}
      {draft ? (
        <MaterialDraft
          key={draft.id}
          seed={draft}
          access={access}
          disabled={blocked}
          onSave={saveDraft}
          onClose={() => setDraft(null)}
        />
      ) : selected ? (
        <>
          <div>
            <Button variant="ghost" onClick={() => setSelected('')}>
              返回列表
            </Button>
          </div>
          <MaterialDetail
            key={`${selectedKind}:${selected}`}
            kind={selectedKind}
            id={selected}
            revision={revision}
            access={access}
            disabled={blocked}
            onDraft={(seed) => {
              setDraft(seed);
            }}
            onCommand={execute}
          />
        </>
      ) : (
        <MaterialList
          kind={kind}
          access={access}
          revision={revision}
          onOpen={(id) => {
            setSelectedKind(kind);
            setSelected(id);
          }}
        />
      )}
      <Separator />
      <p className="text-xs text-muted-foreground">
        完成领料后可从原领料单发起部分退料。成本只读，完成操作以服务端库存及可退数量校验为准。
      </p>
    </div>
  );
}
