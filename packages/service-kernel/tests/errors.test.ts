import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { AppError, registerErrorHandler } from "../src/errors.js";
import { createLogger } from "../src/logger.js";

function buildTestApp(thrown: unknown) {
  const app = Fastify();
  registerErrorHandler(app, createLogger("test"));
  app.get("/boom", () => {
    throw thrown;
  });
  return app;
}

describe("registerErrorHandler", () => {
  it("maps an AppError to its own code/statusCode/message", async () => {
    const app = buildTestApp(new AppError("VALIDATION_ERROR", "invalid input", 400));

    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: "VALIDATION_ERROR", message: "invalid input" } });
  });

  it("includes AppError details when present", async () => {
    const app = buildTestApp(new AppError("VALIDATION_ERROR", "invalid input", 400, { field: "x" }));

    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.json()).toEqual({ error: { code: "VALIDATION_ERROR", message: "invalid input", details: { field: "x" } } });
  });

  it(
    "maps a well-known Fastify framework error (e.g. FST_ERR_CTP_BODY_TOO_LARGE) to its own statusCode/code/message, not a generic 500 (review finding)",
    async () => {
      const fastifyError = Object.assign(new RangeError("Request body is too large"), { statusCode: 413, code: "FST_ERR_CTP_BODY_TOO_LARGE" });
      const app = buildTestApp(fastifyError);

      const response = await app.inject({ method: "GET", url: "/boom" });

      expect(response.statusCode).toBe(413);
      expect(response.json()).toEqual({ error: { code: "FST_ERR_CTP_BODY_TOO_LARGE", message: "Request body is too large" } });
    },
  );

  it("falls through to a generic 500 for a plain Error with no statusCode/code (AD-17: no silent failures, but no leaking of raw internals either)", async () => {
    const app = buildTestApp(new Error("something exploded"));

    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "an unexpected error occurred" } });
  });

  it("falls through to a generic 500 for a Fastify-shaped 5xx error (not a client error)", async () => {
    const serverError = Object.assign(new Error("internal boom"), { statusCode: 500, code: "FST_ERR_SOMETHING" });
    const app = buildTestApp(serverError);

    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "an unexpected error occurred" } });
  });
});
