import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("Project acceptance item readonly display", () => {
  test("renders result and remark as summaries instead of disabled form controls", () => {
    const source = readFileSync(
      new URL("./project-acceptance-detail-parts.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("function ReadOnlyResultStamp");
    expect(source).toContain("function ReadOnlyRemarkSummary");
    expect(source).toContain("<ReadOnlyResultStamp result={result} />");
    expect(source).toContain("<ReadOnlyRemarkSummary remark={remark} />");
    expect(source).toContain("rotate-[-2deg]");
    expect(source).toContain("h-8 w-20");
    expect(source).toContain("aria-label={`验收结果：${resultLabel(result)}`}");
    expect(source).not.toContain("min-w-20");
    expect(source).not.toContain("border-2");
    expect(source).not.toContain("<div className=\"text-xs text-muted-foreground\">验收结果</div>");
    expect(source).toContain("未填写备注");
    expect(source).toContain("text-xs font-medium text-muted-foreground");
    expect(source).not.toContain("min-h-20 rounded-md border px-3 py-2 text-sm leading-6");
    expect(source).not.toContain("placeholder={\n              canEdit(selected.status)");
    expect(source).not.toMatch(/<Textarea[^>]*disabled=\{!editableNow\}/);
    expect(source).not.toMatch(/<Select[^>]*disabled=\{!editableNow\}/);
  });

  test("hides upload action in readonly image blocks", () => {
    const source = readFileSync(
      new URL("./project-acceptance-image-upload-block.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("{disabled ? (");
    expect(source).toContain("{images.length ? `${images.length} 张` : \"无图片\"}");
    expect(source).toContain("htmlFor={disabled ? undefined : inputId}");
    expect(source).toContain(") : disabled ? (");
    expect(source).not.toContain("disabled={disabled || uploading}");
  });

  test("renders overall summary as text in readonly state", () => {
    const source = readFileSync(
      new URL("./project-acceptance-detail.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("function ReadOnlySummaryText");
    expect(source).toContain("<ReadOnlySummaryText value={editable.summary} />");
    expect(source).toContain("未填写整体验收说明");
    expect(source).toContain("border-t pt-3 text-sm leading-6");
    expect(source).toContain("mt-4 overflow-hidden border-y bg-background/60");
    expect(source).not.toContain("mt-4 overflow-hidden rounded-md border bg-background");
    expect(source).not.toContain("disabled={!editableNow}");
    expect(source).not.toContain("min-h-20 rounded-md border px-3 py-2 text-sm leading-6");
  });

  test("lets users expand image evidence beyond the preview limit", () => {
    const source = readFileSync(
      new URL("./project-acceptance-detail-parts.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("const EVIDENCE_PREVIEW_LIMIT = 8");
    expect(source).toContain("const [expanded, setExpanded] = useState(false)");
    expect(source).toContain("expanded ? allImages : allImages.slice(0, EVIDENCE_PREVIEW_LIMIT)");
    expect(source).toContain("展开全部");
    expect(source).toContain("收起");
    expect(source).toContain("还有 {hiddenCount} 张未展示");
  });
});
