import { createLogger } from "@usavvy/service-kernel";
import { loadGatewayConfig } from "./config.js";
import { createCoreClient } from "./coreClient.js";
import { buildApp } from "./app.js";

const config = loadGatewayConfig(process.env);
const logger = createLogger("gateway");
const coreClient = createCoreClient(config.coreServiceUrl, logger, config.internalServiceSecret);

const app = buildApp({
  fetchCoreHealth: () => coreClient.fetchHealth(),
  forwardToCore: (method, path, options) => coreClient.forward(method, path, options),
  forwardBinaryToCore: (method, path, options) => coreClient.forwardBinary(method, path, options),
  corsOrigin: config.webOrigin,
  jwtSecret: config.jwtSecret,
  logger,
});

app.listen({ port: config.port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    logger.error("gateway failed to start", { reason: err.message });
    process.exit(1);
  }
  logger.info("gateway listening", { address });
});

// Review finding: without this, a restart (docker, process manager) drops in-flight
// requests instead of draining them.
async function shutdown(signal: string): Promise<void> {
  logger.info("gateway shutting down", { signal });
  await app.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
