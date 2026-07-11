import { proxyPublicPost } from "@/lib/backend";

export async function POST(request: Request): Promise<Response> {
  return proxyPublicPost(request, "/public/partner-applications");
}
