import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerJwtPlugin, requireAuth, trustedHeaders } from "../src/authPlugin.js";

function buildTestApp(secret: string) {
  const app = Fastify();
  registerJwtPlugin(app, secret);
  app.get("/protected", { preHandler: requireAuth }, async (request) => trustedHeaders(request));
  return app;
}

describe("requireAuth / trustedHeaders", () => {
  it("returns 401 when no token is presented", async () => {
    const app = buildTestApp("secret");
    const response = await app.inject({ method: "GET", url: "/protected" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 401 for a token signed with the wrong secret", async () => {
    const app = buildTestApp("secret");
    const wrongApp = Fastify();
    registerJwtPlugin(wrongApp, "a-different-secret");
    await wrongApp.ready();
    const token = wrongApp.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "GET", url: "/protected", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(401);
    await app.close();
    await wrongApp.close();
  });

  it("returns 401 for an expired token", async () => {
    const app = buildTestApp("secret");
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" }, { expiresIn: "-1s" });

    const response = await app.inject({ method: "GET", url: "/protected", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("sets x-user-id/x-user-role from the verified payload on a valid access token", async () => {
    const app = buildTestApp("secret");
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "GET", url: "/protected", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ "x-user-id": "u1", "x-user-role": "student" });
    await app.close();
  });

  it("rejects a valid, unexpired refresh token presented as an access credential (review finding: tokens were structurally indistinguishable)", async () => {
    const app = buildTestApp("secret");
    await app.ready();
    const refreshToken = app.jwt.sign({ sub: "u1", role: "student", typ: "refresh" });

    const response = await app.inject({ method: "GET", url: "/protected", headers: { authorization: `Bearer ${refreshToken}` } });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
