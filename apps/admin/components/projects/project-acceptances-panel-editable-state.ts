"use client";

import { type ChangeEvent, useEffect, useState } from "react";
import type {
  EditableItem,
  EditableState,
  ProjectAcceptance,
} from "@/components/projects/project-acceptance-types";
import { buildUploadedImagePatch } from "@/components/projects/project-acceptances-panel-api";
import {
  buildEditable,
  resetRejectedEditableItems,
  uploadAcceptanceImageDirect,
} from "@/components/projects/project-acceptance-utils";

export function useProjectAcceptanceEditableState({
  selected,
  projectId,
  setError,
}: {
  selected: ProjectAcceptance | null;
  projectId: string;
  setError: (error: string) => void;
}) {
  const [uploadingItemId, setUploadingItemId] = useState("");
  const [editable, setEditable] = useState<EditableState>(() =>
    buildEditable(null),
  );

  useEffect(() => {
    const nextEditable = buildEditable(selected);
    if (selected?.status === "rejected") {
      setEditable(resetRejectedEditableItems(nextEditable));
      return;
    }
    setEditable(nextEditable);
  }, [selected?.id, selected?.status]);

  const updateEditableItem = (
    itemId: string,
    patch: Partial<EditableItem>,
  ) => {
    setEditable((current) => ({
      ...current,
      items: {
        ...current.items,
        [itemId]: {
          ...current.items[itemId],
          ...patch,
        },
      },
    }));
  };

  const uploadImages = async (
    itemId: string,
    event: ChangeEvent<HTMLInputElement>,
    target: "images" | "rectification_images",
  ) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    setUploadingItemId(`${itemId}:${target}`);
    setError("");
    try {
      const uploaded = await Promise.all(
        files.map((file) => uploadAcceptanceImageDirect(file, projectId)),
      );
      const currentItem = editable.items[itemId];
      updateEditableItem(itemId, buildUploadedImagePatch({
        currentItem,
        target,
        uploaded,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "图片上传失败");
    } finally {
      setUploadingItemId("");
    }
  };

  return {
    uploadingItemId,
    editable,
    setEditable,
    updateEditableItem,
    uploadImages,
  };
}
