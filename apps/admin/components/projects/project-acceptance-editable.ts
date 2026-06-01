import type {
  AcceptanceImageItem,
  AcceptanceTemplate,
  EditableState,
  ProjectAcceptance,
} from "@/components/projects/project-acceptance-types";

export function buildEditable(acceptance: ProjectAcceptance | null): EditableState {
  const normalizeStoredImages = (
    values: string[],
    imageItems: AcceptanceImageItem[] | undefined,
  ) => {
    if (imageItems?.length) {
      return {
        paths: imageItems.map((item) => item.path || item.url || "").filter(Boolean),
        previews: imageItems.map((item) => item.thumb_url || item.url || item.path || "").filter(Boolean),
      };
    }

    return {
      paths: values || [],
      previews: values || [],
    };
  };

  return {
    summary: acceptance?.summary || "",
    items: Object.fromEntries(
      (acceptance?.items || []).map((item) => {
        const images = normalizeStoredImages(item.images || [], item.image_items);
        const rectificationImages = normalizeStoredImages(
          item.rectification_images || [],
          item.rectification_image_items,
        );

        return [
          item.id,
          {
            id: item.id,
            result: item.result,
            remark: item.remark || "",
            images: images.paths,
            imagePreviews: images.previews,
            rectification_remark: item.rectification_remark || "",
            rectification_images: rectificationImages.paths,
            rectificationImagePreviews: rectificationImages.previews,
          },
        ];
      }),
    ),
  };
}

export function resetRejectedEditableItems(editable: EditableState): EditableState {
  return {
    ...editable,
    items: Object.fromEntries(
      Object.entries(editable.items).map(([itemId, item]) => [
        itemId,
        {
          ...item,
          rectification_remark: "",
          rectification_images: [],
          rectificationImagePreviews: [],
        },
      ]),
    ),
  };
}

export function cloneTemplateForEdit(template: AcceptanceTemplate | null) {
  if (!template) return null;

  const sections = template.sections?.length
    ? template.sections
    : [{
      id: null,
      title: "验收项",
      description: null,
      sort_order: 0,
      items: template.items || [],
    }];

  return {
    ...template,
    sections: sections.map((section, sectionIndex) => ({
      ...section,
      sort_order: sectionIndex,
      items: section.items.map((item, itemIndex) => ({
        ...item,
        sort_order: itemIndex,
      })),
    })),
  } satisfies AcceptanceTemplate;
}
