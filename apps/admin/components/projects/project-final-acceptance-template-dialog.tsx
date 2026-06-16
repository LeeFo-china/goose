"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  buildAcceptanceTemplateUpdatePayload,
  cloneAcceptanceTemplateForEdit,
} from "@/components/acceptance-templates/acceptance-template-editor-utils";
import type { AcceptanceTemplate, AcceptanceTemplateItem, AcceptanceTemplateSection } from "@/components/projects/project-acceptance-types";
import { requestBackend } from "@/components/projects/project-acceptance-utils";

export function FinalAcceptanceTemplateDialog({
  open,
  loading,
  error,
  template,
  onSaved,
  onOpenChange,
}: {
  open: boolean;
  loading: boolean;
  error: string;
  template: AcceptanceTemplate | null;
  onSaved: (template: AcceptanceTemplate) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AcceptanceTemplate | null>(null);
  const [localError, setLocalError] = useState("");
  const displayTemplate = editing ? draft : template;
  const sections = displayTemplate?.sections || [];

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setLocalError("");
      return;
    }
    setDraft(cloneAcceptanceTemplateForEdit(template));
  }, [open, template]);

  const updateDraft = (patch: Partial<AcceptanceTemplate>) => {
    setDraft((current) => current ? { ...current, ...patch } : current);
  };

  const updateSection = (
    sectionIndex: number,
    patch: Partial<AcceptanceTemplateSection>,
  ) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: (current.sections || []).map((section, index) =>
          index === sectionIndex ? { ...section, ...patch } : section
        ),
      };
    });
  };

  const updateItem = (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<AcceptanceTemplateItem>,
  ) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: (current.sections || []).map((section, currentSectionIndex) =>
          currentSectionIndex === sectionIndex
            ? {
              ...section,
              items: section.items.map((item, currentItemIndex) =>
                currentItemIndex === itemIndex ? { ...item, ...patch } : item
              ),
            }
            : section
        ),
      };
    });
  };

  const saveTemplate = async () => {
    if (!draft) return;
    setSaving(true);
    setLocalError("");
    try {
      const saved = await requestBackend<AcceptanceTemplate>(
        `/project-acceptance-templates/${draft.id}`,
        {
          method: "PATCH",
          payload: {
            ...buildAcceptanceTemplateUpdatePayload(draft),
          },
        },
      );
      onSaved(saved);
      setDraft(cloneAcceptanceTemplateForEdit(saved));
      setEditing(false);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "竣工模板保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86vh] max-w-[860px] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>竣工交付验收模板</DialogTitle>
          <DialogDescription>
            查看当前启用模板的分组、检查项和拍照要求。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : error || localError ? (
            <StatusAlert>{localError || error}</StatusAlert>
          ) : displayTemplate ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-md border bg-background px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {editing ? (
                    <Input
                      value={draft?.name || ""}
                      disabled={saving}
                      onChange={(event) => updateDraft({ name: event.target.value })}
                    />
                  ) : (
                    <h3 className="text-sm font-semibold">{displayTemplate.name}</h3>
                  )}
                  <Badge variant={displayTemplate.status === "active" ? "success" : "secondary"}>
                    {displayTemplate.status === "active" ? "启用中" : displayTemplate.status}
                  </Badge>
                  <Badge variant="outline">v{displayTemplate.version}</Badge>
                </div>
                {editing ? (
                  <Textarea
                    className="mt-3"
                    value={draft?.description || ""}
                    disabled={saving}
                    onChange={(event) =>
                      updateDraft({ description: event.target.value })}
                    placeholder="填写模板说明"
                  />
                ) : displayTemplate.description ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {displayTemplate.description}
                  </p>
                ) : null}
              </div>

              {sections.map((section, sectionIndex) => (
                <section key={section.id || "template-items"} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      {editing ? (
                        <Input
                          value={section.title}
                          disabled={saving}
                          onChange={(event) =>
                            updateSection(sectionIndex, { title: event.target.value })}
                        />
                      ) : (
                        <h4 className="truncate text-sm font-semibold">{section.title}</h4>
                      )}
                      {!editing && section.description ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {section.description}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant="secondary">{section.items.length} 项</Badge>
                  </div>
                  <div className="flex flex-col gap-2">
                    {section.items.map((item, itemIndex) => (
                      <div key={item.id} className="rounded-md border bg-background px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {editing ? (
                            <Input
                              value={item.title}
                              disabled={saving}
                              onChange={(event) =>
                                updateItem(sectionIndex, itemIndex, {
                                  title: event.target.value,
                                })}
                            />
                          ) : (
                            <span className="text-sm font-medium">{item.title}</span>
                          )}
                          {!editing && item.required ? <Badge variant="outline">必检</Badge> : null}
                          {!editing && item.photo_required ? (
                              <Badge variant="outline">
                                需 {Math.max(item.photo_min_count || 1, 1)} 张照片
                              </Badge>
                            ) : null}
                          {!editing && item.remark_required_on_fail ? (
                              <Badge variant="outline">不通过需备注</Badge>
                            ) : null}
                        </div>
                        {editing ? (
                          <div className="mt-3 flex flex-col gap-3">
                            <Textarea
                              value={item.standard}
                              disabled={saving}
                              onChange={(event) =>
                                updateItem(sectionIndex, itemIndex, {
                                  standard: event.target.value,
                                })}
                              placeholder="填写验收标准"
                            />
                            <div className="grid gap-3 md:grid-cols-3">
                              <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={item.required}
                                  disabled={saving}
                                  onCheckedChange={(checked) =>
                                    updateItem(sectionIndex, itemIndex, {
                                      required: checked === true,
                                    })}
                                />
                                必检
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={item.photo_required}
                                  disabled={saving}
                                  onCheckedChange={(checked) =>
                                    updateItem(sectionIndex, itemIndex, {
                                      photo_required: checked === true,
                                    })}
                                />
                                需要现场照片
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={item.remark_required_on_fail}
                                  disabled={saving}
                                  onCheckedChange={(checked) =>
                                    updateItem(sectionIndex, itemIndex, {
                                      remark_required_on_fail: checked === true,
                                    })}
                                />
                                不通过需备注
                              </label>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {item.standard}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              暂无启用的竣工交付验收模板
            </div>
          )}
        </div>

        <DialogFooter>
          {template ? (
            <Button
              type="button"
              variant="outline"
              disabled={loading || saving}
              onClick={() => {
                if (editing) {
                  setDraft(cloneAcceptanceTemplateForEdit(template));
                  setEditing(false);
                  setLocalError("");
                  return;
                }
                setEditing(true);
              }}
            >
              {editing ? "取消编辑" : "编辑模板"}
            </Button>
          ) : null}
          {editing ? (
            <Button type="button" disabled={saving} onClick={saveTemplate}>
              {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存模板
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
