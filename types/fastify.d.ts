import "fastify";
import "@fastify/multipart";
import type { JwtPayload } from "@/utils/jwt";
import type { AuthContext } from "@/services/authorization";

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload;
    authContext?: AuthContext;
  }
}
