'use client';

import { StatusAlert } from '@/components/admin/status-alert';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function TransferDraftConflict({ onReload }: { onReload: () => void }) {
  return (
    <StatusAlert tone="warning" title="草稿保存冲突">
      <p>本次输入已保留，不能继续按旧版本保存。</p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline">放弃修改并重载</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃本次修改并重新读取？</AlertDialogTitle>
            <AlertDialogDescription>
              本次未保存输入将被丢弃，重新读取最新单据后才能再次编辑，不会自动提交。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>保留输入</AlertDialogCancel>
            <AlertDialogAction onClick={onReload}>确认放弃并重载</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StatusAlert>
  );
}
