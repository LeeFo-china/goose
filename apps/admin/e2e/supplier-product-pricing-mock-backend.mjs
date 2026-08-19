import { createServer } from "node:http";

import { handleSupplierProductPricingMock } from "./supplier-product-pricing-mock-handlers.mjs";
import { mockPort } from "./supplier-product-pricing-mock-state.mjs";

const server = createServer((request, response) =>
  handleSupplierProductPricingMock(request, response));

server.listen(mockPort, "127.0.0.1", () => {
  console.log(`[supplier-product-pricing-mock] listening on ${mockPort}`);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 2_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
