# Douyin Material Note Rich Editor Design

## Goal

Tenant admins can create and edit Douyin material notes with a simpler rich text editor that supports text and inline images. The public mini-program experience can render those image blocks after a user claims the material, without exposing tenant identity fields, arbitrary HTML, external image URLs, or private storage keys.

## Recommendation

Use Tiptap only as the admin authoring surface. Keep the persisted and API-facing content contract as structured `content_blocks`.

This preserves the current immutable version model, publication flow, database validation, and mini-program parser boundaries. It also avoids asking the Douyin mini-program to render arbitrary HTML.

## Scope

First release includes:

- Admin rich editor for title, paragraph, ordered list, unordered list, quote, callout, and image blocks.
- Image upload through the existing COS direct upload flow.
- One image per image block, with required `fileId` and required `alt`.
- Optional image caption in admin and mini-program display.
- Existing draft create and append-version endpoints remain the write contract.
- Mini-program claimed material detail renders image blocks from trusted `asset.src`.
- Copy-full-text serializes image blocks as readable image placeholders.

Out of scope:

- Arbitrary HTML storage or rendering.
- External image URLs, base64 images, remote image paste, video, embeds, tables, marks, and custom CSS.
- Gallery blocks, image cropping, drag/drop upload polish, or image library picker.
- Changing the claim, publish, archive, withdraw, or version history contracts beyond adding the image block shape.

## Content Model

Admin draft image block:

```json
{
  "type": "image",
  "fileId": "550e8400-e29b-41d4-a716-446655440000",
  "alt": "客厅墙面基层处理示意图",
  "caption": "施工前确认墙面平整度"
}
```

Public claimed image block:

```json
{
  "type": "image",
  "asset": {
    "fileId": "550e8400-e29b-41d4-a716-446655440000",
    "src": "https://assets.goodcms.cn/tenant/demo.jpg",
    "alt": "客厅墙面基层处理示意图",
    "width": 1200,
    "height": 800
  },
  "caption": "施工前确认墙面平整度"
}
```

Tenant admin detail and version detail can continue to return draft blocks with `fileId`, because admins are editing source content. Mini-program claimed detail should receive public blocks with trusted `asset` objects.

## Backend

Domain contracts add image support in a controlled way:

- Tenant draft/version schemas accept `image` blocks with `fileId`, `alt`, and optional `caption`.
- Public preview remains body-free.
- Claimed and owned detail schemas return public image blocks with resolved asset metadata.
- List, version history, and tenant detail remain body-free.

Service changes:

- Tenant admin write paths continue to validate draft blocks before RPC.
- Mini-program `claim` and `getOwnedDetail` load referenced image files after repository fetch.
- The service verifies every referenced file is active, public, image MIME type, and belongs to the current tenant or an explicitly allowed public scope.
- Missing or unusable files fail with a stable backend error instead of returning a broken image URL.

Repository changes:

- Add a bounded file lookup by referenced image IDs.
- Select only required file columns: id, tenant_id, status, visibility, mime_type, public_url, width, height.
- Keep list queries paginated and body-free.

Database changes:

- Add a forward migration replacing `is_valid_douyin_material_note_content_blocks(jsonb)`.
- Allow `image` blocks with strict keys only.
- Retain existing 100-block, 512 KiB, and text length limits.
- Validate image IDs as UUID text, alt 1 to 300 chars, caption 1 to 1000 chars when present.

## Admin

Add a dedicated material note rich editor component. It should use Tiptap for the body while preserving the current form shell, permissions, status alerts, and submit flow.

Allowed Tiptap capabilities:

- Document
- Paragraph
- Heading levels 2 and 3
- Bullet list
- Ordered list
- Blockquote
- Hard break where it can be converted into paragraph text
- Custom callout block
- Custom material image block

The editor toolbar stays compact: paragraph/heading selector, list buttons, quote, callout, image upload, undo, redo. Unsupported Tiptap marks and nodes are disabled or omitted.

On every editor update:

- Convert the Tiptap document to draft `content_blocks`.
- Update preview through existing `MaterialNoteDraftPreview`.
- Surface conversion errors near the body field.

On load:

- Convert existing draft `content_blocks` to a Tiptap document.
- Unknown or unsupported blocks are rejected by schema and should not be fabricated.

## Mini-Program

The Douyin mini-program parser adds image-block support only for claimed/owned content, not public previews.

Rendering rules:

- `image` uses `asset.src`, `mode="widthFix"`, and lazy loading.
- If an image fails to load, hide that image block or show a compact unavailable state.
- Caption displays below the image when present.
- Copy-full-text includes image placeholders such as `[图片：客厅墙面基层处理示意图]`.

The mini-program should continue to reject `fileId`, external `src` outside the trusted `asset` object, unknown fields, and HTML.

## Security

The design keeps three boundaries:

- Admin input stores structured data, not HTML.
- Backend resolves file IDs to trusted public URLs after ownership and visibility checks.
- Mini-program renders only typed blocks that passed its own parser.

Images must not leak storage object keys, private URLs, subject hashes, tenant installation IDs, or claim identities.

## Verification

Minimum verification:

- Domain schema tests for draft image blocks and public image blocks.
- Database migration contract test for image validation rules.
- API service tests that resolve file IDs into public assets and reject unusable files.
- Admin contract tests for Tiptap dependency, restricted toolbar, image upload entry, and no HTML editor.
- Mini-program parser/model/page tests for image rendering and copy serialization.
- `pnpm --dir apps/admin check`
- `bun --cwd apps/douyin-mini check`
- `pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit`
