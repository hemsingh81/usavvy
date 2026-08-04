import { loadWebConfig, type WebConfig } from "@usavvy/config";

export function getWebConfig(): WebConfig {
  return loadWebConfig(import.meta.env);
}
