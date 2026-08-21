import "reflect-metadata"; // 必须在第一行
import Fastify from "fastify";
import AutoLoad from "@fastify/autoload";
import multipart from "@fastify/multipart";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import errorHandler from "./plugins/error-handler";
import authPlugin from "./plugins/auth";
import requestLoggingPlugin from "./plugins/request-logging";
import { refreshPlatformCosPublicBaseUrlCache } from "@/services/files/file-url-resolver";
import { administrativeAreaService } from "@/services/administrative-areas";
import { visitorPictureLibraryService } from "@/services/visitor-picture-library";
import { parseFastifyTrustProxy } from "@/utils/trusted-proxy-client-ip";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logLevel = process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const app = Fastify({
  trustProxy: parseFastifyTrustProxy(process.env.GOOES_TRUST_PROXY_HOPS),
  logger: {
    level: logLevel,
    redact: {
      censor: "[REDACTED]",
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-token']",
        "req.headers['x-openid']",
        "req.headers['x-wx-openid']",
        "headers.authorization",
        "headers.cookie",
        "authorization",
        "cookie",
        "phone",
        "openid",
        "unionid",
        "*.token",
        "*.access_token",
        "*.refresh_token",
        "*.password",
        "*.phone",
        "*.openid",
        "*.unionid",
        "*.verification_code",
        "*.verificationCode",
      ],
    },
  },
  disableRequestLogging: true,
});
app.register(multipart, {
  limits: {
    files: 9,
    fileSize: 10 * 1024 * 1024,
  },
});
errorHandler(app);
requestLoggingPlugin(app);
authPlugin(app);
app.register(AutoLoad, {
  dir: join(__dirname, "routes"),
});

refreshPlatformCosPublicBaseUrlCache().finally(() => {
  app.listen({ port: Number(process.env.PORT), host: "0.0.0.0" }, (err) => {
    if (err) throw err;

    if (process.env.NODE_ENV === "development") {
      console.log("\n📋 Registered Routes:");
      console.log(app.printRoutes());
      console.log("\n");
    }

    administrativeAreaService.prewarmPublicCache().catch((cacheError) => {
      app.log.warn({ err: cacheError }, "prewarm administrative area public cache failed");
    });
    visitorPictureLibraryService.prewarmPublicListCache().catch((cacheError) => {
      app.log.warn({ err: cacheError }, "prewarm picture library public list cache failed");
    });
  });
});
