import { revalidatePath, revalidateTag } from "next/cache";

import { createRevalidateHandler } from "../../../lib/revalidate-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createRevalidateHandler({ revalidatePath, revalidateTag });
