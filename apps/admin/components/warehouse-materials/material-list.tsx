'use client';

import { useEffect, useState } from 'react';
import {
  WAREHOUSE_ISSUE_STATUS_LABELS,
  WAREHOUSE_RETURN_STATUS_LABELS,
  type WarehouseMaterialDocumentType,
  type WarehouseMaterialOrder,
} from '@gooes/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FormSelect } from '@/components/admin/form-select';
import { StatusAlert } from '@/components/admin/status-alert';
import { InventoryWarehouseFilter } from '@/components/inventory/inventory-warehouse-filter';
import { BatchOptionPicker } from '@/components/supplier-purchase-batches/batch-option-picker';
import {
  materialListPath,
  materialError,
  type MaterialAccess,
} from './material-rules';
import { loadProjects, readMaterial, type MaterialPage } from './material-api';
import { materialMoney, MaterialPager } from './material-parts';

export function MaterialList({
  kind,
  access,
  revision,
  onOpen,
}: {
  kind: WarehouseMaterialDocumentType;
  access: MaterialAccess;
  revision: number;
  onOpen: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('all');
  const [warehouse, setWarehouse] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [project, setProject] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [result, setResult] =
    useState<MaterialPage<WarehouseMaterialOrder> | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const path = materialListPath(kind, {
    page,
    pageSize,
    keyword,
    status: status === 'all' ? '' : status,
    warehouseId: warehouse?.id,
    projectId: project?.id,
  });
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError('');
    readMaterial<MaterialPage<WarehouseMaterialOrder>>(path, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        if (page > Math.max(1, next.pagination.totalPages)) {
          setPage(Math.max(1, next.pagination.totalPages));
          return;
        }
        setResult(next);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(materialError(error));
      });
    return () => controller.abort();
  }, [path, revision, retry, page]);
  const labels =
    kind === 'issue'
      ? WAREHOUSE_ISSUE_STATUS_LABELS
      : WAREHOUSE_RETURN_STATUS_LABELS;
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="单据列表">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setKeyword(search.trim());
            setPage(1);
          }}
        >
          <Field>
            <FieldLabel htmlFor="material-search">搜索单号 / 原因</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="material-search"
                value={search}
                maxLength={80}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button variant="outline" type="submit">
                搜索
              </Button>
            </div>
          </Field>
        </form>
        <Field>
          <FieldLabel htmlFor="material-status">状态</FieldLabel>
          <FormSelect
            id="material-status"
            value={status}
            options={[
              { value: 'all', label: '全部状态' },
              ...Object.entries(labels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
        </Field>
        <InventoryWarehouseFilter
          canViewWarehouses={access.canViewWarehouses}
          value={warehouse}
          onChange={(value) => {
            setWarehouse(value);
            setPage(1);
          }}
        />
        {(access.canManage || access.canApprove) && (
          <BatchOptionPicker
            id="material-filter-project"
            label="筛选项目"
            value={project}
            load={loadProjects}
            onChange={(value) => {
              setProject(value);
              setPage(1);
            }}
          />
        )}
      </div>
      <div>
        {project && <span className="text-sm">项目筛选：{project.name}</span>}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setWarehouse(null);
            setProject(null);
            setStatus('all');
            setKeyword('');
            setSearch('');
            setPage(1);
          }}
        >
          清除筛选
        </Button>
      </div>
      {error ? (
        <StatusAlert>
          {error}
          <Button variant="link" onClick={() => setRetry((value) => value + 1)}>
            重试列表
          </Button>
        </StatusAlert>
      ) : !result ? (
        <p role="status">正在加载单据…</p>
      ) : !result.list.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>暂无符合条件的单据</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table aria-label="领退料单据" className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              {[
                '单号',
                '仓库',
                '项目',
                '状态',
                '材料数',
                '成本金额',
                '操作',
              ].map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.list.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{order.order_no}</TableCell>
                <TableCell>{order.warehouse_name}</TableCell>
                <TableCell>
                  <Button
                    variant="link"
                    onClick={() => {
                      setProject({
                        id: order.project_id,
                        name: order.project_name,
                      });
                      setPage(1);
                    }}
                  >
                    {order.project_name}
                  </Button>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {order.document_type === 'issue'
                      ? WAREHOUSE_ISSUE_STATUS_LABELS[order.status]
                      : WAREHOUSE_RETURN_STATUS_LABELS[order.status]}
                  </Badge>
                </TableCell>
                <TableCell>{order.item_count}</TableCell>
                <TableCell>{materialMoney(order.total_amount)}</TableCell>
                <TableCell>
                  <Button variant="link" onClick={() => onOpen(order.id)}>
                    查看 {order.order_no}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <MaterialPager
        pagination={result?.pagination}
        disabled={!result || !!error}
        onPage={setPage}
        onSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </section>
  );
}
