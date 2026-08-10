import "fastify";
import "@fastify/multipart";
import type { TenantServiceRouteAccess } from "@gooes/domain";
import type { JwtPayload } from "@/utils/jwt";
import type { AuthContext } from "@/services/authorization";

type MultipartUploadPart =
  | {
    type: "field";
    fieldname: string;
    value: unknown;
  }
  | {
    type: "file";
    fieldname: string;
    filename: string;
    mimetype: string;
    toBuffer: () => Promise<Buffer>;
  };

declare module "fastify" {
  interface FastifyContextConfig {
    tenantServiceAccess?: TenantServiceRouteAccess;
  }

  interface FastifyRequest {
    user?: JwtPayload;
    authContext?: AuthContext;
    rawBody?: string;
    isMultipart: () => boolean;
    parts: () => AsyncIterableIterator<MultipartUploadPart>;
  }
}
