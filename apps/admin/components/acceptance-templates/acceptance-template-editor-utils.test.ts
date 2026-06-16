import { describe, expect, test } from "bun:test";
import type { AcceptanceTemplate } from "@/components/projects/project-acceptance-types";
import { buildAcceptanceTemplateUpdatePayload } from "./acceptance-template-editor-utils";

const template: AcceptanceTemplate = {
  id: "template-1",
  name: "瓦工验收模板",
  description: "用于瓦工节点",
  version: 3,
  status: "active",
  acceptance_type: "stage",
  stage_code: "tiling",
  sections: [
    {
      id: "section-a",
      title: "墙地砖",
      description: null,
      sort_order: 8,
      items: [
        {
          id: "item-a",
          section_id: "section-a",
          category: "工艺",
          title: "瓷砖空鼓",
          standard: "空鼓范围符合公司验收标准",
          required: true,
          allow_not_applicable: false,
          photo_required: true,
          photo_min_count: 2,
          photo_max_count: 4,
          remark_required_on_fail: true,
          sort_order: 7,
        },
      ],
    },
    {
      id: null,
      title: "收口",
      description: "检查可见收口",
      sort_order: 4,
      items: [
        {
          id: "item-b",
          section_id: null,
          category: null,
          title: "阴阳角",
          standard: "阴阳角顺直",
          required: false,
          allow_not_applicable: true,
          photo_required: false,
          photo_min_count: 0,
          photo_max_count: 9,
          remark_required_on_fail: false,
          sort_order: 3,
        },
      ],
    },
  ],
};

describe("buildAcceptanceTemplateUpdatePayload", () => {
  test("serializes editable template sections and items for backend patch", () => {
    expect(buildAcceptanceTemplateUpdatePayload(template)).toEqual({
      name: "瓦工验收模板",
      description: "用于瓦工节点",
      status: "active",
      sections: [
        {
          id: "section-a",
          title: "墙地砖",
          description: null,
          sort_order: 0,
          items: [
            {
              id: "item-a",
              category: "工艺",
              title: "瓷砖空鼓",
              standard: "空鼓范围符合公司验收标准",
              required: true,
              allow_not_applicable: false,
              photo_required: true,
              photo_min_count: 2,
              photo_max_count: 4,
              remark_required_on_fail: true,
              sort_order: 0,
            },
          ],
        },
        {
          id: undefined,
          title: "收口",
          description: "检查可见收口",
          sort_order: 1,
          items: [
            {
              id: "item-b",
              category: null,
              title: "阴阳角",
              standard: "阴阳角顺直",
              required: false,
              allow_not_applicable: true,
              photo_required: false,
              photo_min_count: 0,
              photo_max_count: 9,
              remark_required_on_fail: false,
              sort_order: 0,
            },
          ],
        },
      ],
    });
  });
});
