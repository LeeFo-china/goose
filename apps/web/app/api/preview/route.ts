import { createPreviewHandler } from "../../../lib/preview-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createPreviewHandler();
