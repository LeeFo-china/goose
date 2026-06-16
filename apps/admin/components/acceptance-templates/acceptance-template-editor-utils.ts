import type {
  AcceptanceTemplate,
  AcceptanceTemplateItem,
  AcceptanceTemplateSection,
} from "@/components/projects/project-acceptance-types";

export type AcceptanceTemplateUpdatePayload = {
  name: string;
  description?: string | null;
  status?: string;
  sections: Array<{
    id?: string;
    title: string;
    description?: string | null;
    sort_order: number;
    items: Array<{
      id?: string;
      category?: string | null;
      title: string;
      standard: string;
      required: boolean;
      allow_not_applicable: boolean;
      photo_required: boolean;
      photo_min_count: number;
      photo_max_count: number;
      remark_required_on_fail: boolean;
      sort_order: number;
    }>;
  }>;
};

export function cloneAcceptanceTemplateForEdit(
  template: AcceptanceTemplate | null,
): AcceptanceTemplate | null {
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
  };
}

export function buildAcceptanceTemplateUpdatePayload(
  template: AcceptanceTemplate,
): AcceptanceTemplateUpdatePayload {
  return {
    name: template.name,
    description: template.description,
    status: template.status,
    sections: getEditableSections(template).map((section, sectionIndex) => ({
      id: section.id || undefined,
      title: section.title,
      description: section.description,
      sort_order: sectionIndex,
      items: section.items.map((item, itemIndex) => ({
        id: item.id || undefined,
        category: item.category,
        title: item.title,
        standard: item.standard,
        required: item.required,
        allow_not_applicable: item.allow_not_applicable,
        photo_required: item.photo_required,
        photo_min_count: item.photo_min_count,
        photo_max_count: item.photo_max_count,
        remark_required_on_fail: item.remark_required_on_fail,
        sort_order: itemIndex,
      })),
    })),
  };
}

function getEditableSections(
  template: AcceptanceTemplate,
): AcceptanceTemplateSection[] {
  if (template.sections?.length) return template.sections;
  return [{
    id: null,
    title: "验收项",
    description: null,
    sort_order: 0,
    items: template.items || [],
  }];
}

export function createEmptyTemplateSection(): AcceptanceTemplateSection {
  return {
    id: null,
    title: "新分组",
    description: null,
    sort_order: 0,
    items: [createEmptyTemplateItem()],
  };
}

export function createEmptyTemplateItem(): AcceptanceTemplateItem {
  return {
    id: "",
    section_id: null,
    category: null,
    title: "新检查项",
    standard: "填写验收标准",
    required: true,
    allow_not_applicable: false,
    photo_required: false,
    photo_min_count: 0,
    photo_max_count: 9,
    remark_required_on_fail: true,
    sort_order: 0,
  };
}

export function getAcceptanceTemplateValidationError(
  template: AcceptanceTemplate | null,
) {
  if (!template) return "请选择验收模板";
  if (!template.name.trim()) return "模板名称不能为空";
  const sections = template.sections || [];
  if (sections.length === 0) return "至少需要一个模板分组";
  for (const section of sections) {
    if (!section.title.trim()) return "分组名称不能为空";
    if (section.items.length === 0) return "每个分组至少需要一个检查项";
    for (const item of section.items) {
      if (!item.title.trim()) return "检查项标题不能为空";
      if (!item.standard.trim()) return "验收标准不能为空";
      if (item.photo_min_count > item.photo_max_count) {
        return "最少照片数不能大于最多照片数";
      }
    }
  }
  return "";
}
