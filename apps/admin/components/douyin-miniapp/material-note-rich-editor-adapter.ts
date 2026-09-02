import type { DouyinMaterialNoteBlock } from "@gooes/domain";

export type MaterialNoteTiptapTextNode = {
  type: "text";
  text: string;
};

export type MaterialNoteTiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: MaterialNoteTiptapNode[] | MaterialNoteTiptapTextNode[];
};

export type MaterialNoteTiptapDoc = {
  type: "doc";
  content: MaterialNoteTiptapNode[];
};

type ImagePreviewMap = Readonly<Record<string, string | undefined>>;

export function buildMaterialNoteImagePreviewUrl(
  fileId: string,
  imagePreviews: ImagePreviewMap = {},
): string {
  const preview = imagePreviews[fileId]?.trim();
  if (preview) return preview;
  const normalizedFileId = fileId.trim();
  if (!normalizedFileId) return "";
  return `/api/backend/uploads/public-url?fileId=${encodeURIComponent(normalizedFileId)}`;
}

export function removeMaterialNoteImageBlock(
  blocks: readonly DouyinMaterialNoteBlock[],
  index: number,
): DouyinMaterialNoteBlock[] {
  return blocks.filter((block, blockIndex) =>
    blockIndex !== index || block.type !== "image"
  );
}

export function materialNoteBlocksToTiptapDoc(
  blocks: readonly DouyinMaterialNoteBlock[],
  imagePreviews: ImagePreviewMap = {},
): MaterialNoteTiptapDoc {
  return {
    type: "doc",
    content: blocks.map((block) => materialNoteBlockToTiptapNode(block, imagePreviews)),
  };
}

export function tiptapDocToMaterialNoteBlocks(value: unknown): DouyinMaterialNoteBlock[] {
  if (!isRecord(value) || value.type !== "doc" || !Array.isArray(value.content)) return [];
  return value.content.flatMap(tiptapNodeToMaterialNoteBlocks).slice(0, 100);
}

function materialNoteBlockToTiptapNode(
  block: DouyinMaterialNoteBlock,
  imagePreviews: ImagePreviewMap,
): MaterialNoteTiptapNode {
  switch (block.type) {
    case "heading":
      return {
        type: "heading",
        attrs: { level: block.level },
        content: textContent(block.text),
      };
    case "paragraph":
      return { type: "paragraph", content: textContent(block.text) };
    case "list":
      return {
        type: block.style === "ordered" ? "orderedList" : "bulletList",
        content: block.items.map((item) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: textContent(item) }],
        })),
      };
    case "quote":
      return {
        type: "blockquote",
        attrs: block.attribution ? { attribution: block.attribution } : {},
        content: [{ type: "paragraph", content: textContent(block.text) }],
      };
    case "callout":
      return {
        type: "materialCallout",
        attrs: { tone: block.tone, title: block.title, text: block.text },
      };
    case "image":
      return {
        type: "materialImage",
        attrs: {
          fileId: block.fileId,
          src: buildMaterialNoteImagePreviewUrl(block.fileId, imagePreviews),
          alt: block.alt,
          caption: block.caption ?? "",
        },
      };
  }
}

function tiptapNodeToMaterialNoteBlocks(node: unknown): DouyinMaterialNoteBlock[] {
  if (!isRecord(node) || typeof node.type !== "string") return [];
  switch (node.type) {
    case "heading": {
      const level = isRecord(node.attrs) && node.attrs.level === 3 ? 3 : 2;
      const text = collectText(node);
      return text ? [{ type: "heading", level, text }] : [];
    }
    case "paragraph": {
      const text = collectText(node);
      return text ? [{ type: "paragraph", text }] : [];
    }
    case "bulletList":
    case "orderedList": {
      const items = Array.isArray(node.content)
        ? node.content.map((item) => collectText(item).trim()).filter(Boolean)
        : [];
      return items.length > 0
        ? [{ type: "list", style: node.type === "orderedList" ? "ordered" : "unordered", items }]
        : [];
    }
    case "blockquote": {
      const text = collectText(node);
      if (!text) return [];
      const attribution = isRecord(node.attrs) && typeof node.attrs.attribution === "string"
        ? node.attrs.attribution.trim()
        : "";
      return [{
        type: "quote",
        text,
        ...(attribution ? { attribution } : {}),
      }];
    }
    case "materialCallout": {
      if (!isRecord(node.attrs)) return [];
      const tone = node.attrs.tone === "warning" ? "warning" : "info";
      const title = typeof node.attrs.title === "string" ? node.attrs.title.trim() : "";
      const text = typeof node.attrs.text === "string" ? node.attrs.text.trim() : "";
      return title && text ? [{ type: "callout", tone, title, text }] : [];
    }
    case "materialImage": {
      if (!isRecord(node.attrs)) return [];
      const fileId = typeof node.attrs.fileId === "string" ? node.attrs.fileId.trim() : "";
      const alt = typeof node.attrs.alt === "string" ? node.attrs.alt.trim() : "";
      const caption = typeof node.attrs.caption === "string" ? node.attrs.caption.trim() : "";
      return fileId && alt
        ? [{
          type: "image",
          fileId,
          alt,
          ...(caption ? { caption } : {}),
        }]
        : [];
    }
    default:
      return [];
  }
}

function textContent(text: string): MaterialNoteTiptapTextNode[] {
  return text ? [{ type: "text", text }] : [];
}

function collectText(node: unknown): string {
  if (!isRecord(node)) return "";
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map(collectText).join("\n").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
