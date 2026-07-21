"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function PlatformWechatPayApplymentSubmitDialog({
  triggerLabel,
  title,
  description,
  confirmLabel,
  pending,
  destructive,
  icon,
  onConfirm,
}: {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  destructive?: boolean;
  icon?: ReactNode;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          className="w-full"
          variant={destructive ? "destructive" : "default"}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : icon}
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
