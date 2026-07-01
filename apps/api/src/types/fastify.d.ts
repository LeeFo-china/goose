import "fastify";
import "@fastify/multipart";
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
  interface FastifyRequest {
    user?: JwtPayload;
    authContext?: AuthContext;
    rawBody?: string;
    isMultipart: () => boolean;
    parts: () => AsyncIterableIterator<MultipartUploadPart>;
  }
}
