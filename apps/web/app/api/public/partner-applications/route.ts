import { proxyVisitorPublicPost } from "@/lib/backend";

export async function POST(request: Request): Promise<Response> {
  return proxyVisitorPublicPost(request, "/public/partner-applications");
}
