import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createTestAppDeps } from "./testHelpers.js";

const VALID_ID = "019fd2fd-0000-7000-8000-000000000001";

describe("POST /courses", () => {
  it("returns 401 with no token and never calls courses", async () => {
    const forwardToCourses = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCourses }));

    const response = await app.inject({ method: "POST", url: "/courses", payload: { title: "x" } });

    expect(response.statusCode).toBe(401);
    expect(forwardToCourses).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards the body and trusted headers derived from a valid token", async () => {
    const forwardToCourses = vi.fn().mockResolvedValue({ status: 200, body: { id: "c1", title: "x" } });
    const app = buildApp(createTestAppDeps({ forwardToCourses }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "admin", typ: "access" });

    const response = await app.inject({ method: "POST", url: "/courses", headers: { authorization: `Bearer ${token}` }, payload: { title: "x" } });

    expect(response.statusCode).toBe(200);
    expect(forwardToCourses).toHaveBeenCalledWith("POST", "/courses", { body: { title: "x" }, headers: { "x-user-id": "u1", "x-user-role": "admin" } });
    await app.close();
  });

  it("forwards a non-admin token's write attempt too (review finding: RBAC is enforced at the courses service layer, not re-implemented at the gateway — mirrors how core's own routes, not gateway's, own every authorization decision)", async () => {
    const forwardToCourses = vi.fn().mockResolvedValue({ status: 403, body: { error: { code: "FORBIDDEN", message: "not permitted" } } });
    const app = buildApp(createTestAppDeps({ forwardToCourses }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "POST", url: "/courses", headers: { authorization: `Bearer ${token}` }, payload: { title: "x" } });

    expect(response.statusCode).toBe(403);
    expect(forwardToCourses).toHaveBeenCalledWith("POST", "/courses", { body: { title: "x" }, headers: { "x-user-id": "u1", "x-user-role": "student" } });
    await app.close();
  });
});

describe("POST /courses/:id/modules", () => {
  it("returns 401 with no token and never calls courses", async () => {
    const forwardToCourses = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCourses }));

    const response = await app.inject({ method: "POST", url: `/courses/${VALID_ID}/modules`, payload: { title: "x", position: 0 } });

    expect(response.statusCode).toBe(401);
    expect(forwardToCourses).not.toHaveBeenCalled();
    await app.close();
  });

  it("interpolates the id param into the forwarded courses path", async () => {
    const forwardToCourses = vi.fn().mockResolvedValue({ status: 200, body: {} });
    const app = buildApp(createTestAppDeps({ forwardToCourses }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "admin", typ: "access" });

    const response = await app.inject({
      method: "POST",
      url: `/courses/${VALID_ID}/modules`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: "x", position: 0 },
    });

    expect(response.statusCode).toBe(200);
    expect(forwardToCourses).toHaveBeenCalledWith("POST", `/courses/${VALID_ID}/modules`, {
      body: { title: "x", position: 0 },
      headers: { "x-user-id": "u1", "x-user-role": "admin" },
    });
    await app.close();
  });

  it("rejects a path-traversal id with a 400 rather than forwarding it", async () => {
    const forwardToCourses = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCourses }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "admin", typ: "access" });

    const response = await app.inject({
      method: "POST",
      url: "/courses/..%2Fother-route/modules",
      headers: { authorization: `Bearer ${token}` },
      payload: { title: "x", position: 0 },
    });

    expect(response.statusCode).toBe(400);
    expect(forwardToCourses).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("POST /modules/:id/topics", () => {
  it("interpolates the id param into the forwarded courses path", async () => {
    const forwardToCourses = vi.fn().mockResolvedValue({ status: 200, body: {} });
    const app = buildApp(createTestAppDeps({ forwardToCourses }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "admin", typ: "access" });

    const response = await app.inject({
      method: "POST",
      url: `/modules/${VALID_ID}/topics`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: "x", position: 0 },
    });

    expect(response.statusCode).toBe(200);
    expect(forwardToCourses).toHaveBeenCalledWith("POST", `/modules/${VALID_ID}/topics`, {
      body: { title: "x", position: 0 },
      headers: { "x-user-id": "u1", "x-user-role": "admin" },
    });
    await app.close();
  });
});

describe("POST /topics/:id/concepts", () => {
  it("interpolates the id param into the forwarded courses path", async () => {
    const forwardToCourses = vi.fn().mockResolvedValue({ status: 200, body: {} });
    const app = buildApp(createTestAppDeps({ forwardToCourses }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "admin", typ: "access" });

    const response = await app.inject({
      method: "POST",
      url: `/topics/${VALID_ID}/concepts`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: "x", position: 0 },
    });

    expect(response.statusCode).toBe(200);
    expect(forwardToCourses).toHaveBeenCalledWith("POST", `/topics/${VALID_ID}/concepts`, {
      body: { title: "x", position: 0 },
      headers: { "x-user-id": "u1", "x-user-role": "admin" },
    });
    await app.close();
  });
});

describe("DELETE /modules/:id", () => {
  it("returns 401 with no token and never calls courses", async () => {
    const forwardToCourses = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCourses }));

    const response = await app.inject({ method: "DELETE", url: `/modules/${VALID_ID}` });

    expect(response.statusCode).toBe(401);
    expect(forwardToCourses).not.toHaveBeenCalled();
    await app.close();
  });

  it("interpolates the id param and mirrors a 204", async () => {
    const forwardToCourses = vi.fn().mockResolvedValue({ status: 204, body: undefined });
    const app = buildApp(createTestAppDeps({ forwardToCourses }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "admin", typ: "access" });

    const response = await app.inject({ method: "DELETE", url: `/modules/${VALID_ID}`, headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(204);
    expect(forwardToCourses).toHaveBeenCalledWith("DELETE", `/modules/${VALID_ID}`, { headers: { "x-user-id": "u1", "x-user-role": "admin" } });
    await app.close();
  });

  it("rejects a path-traversal id with a 400 rather than forwarding it", async () => {
    const forwardToCourses = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCourses }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "admin", typ: "access" });

    const response = await app.inject({ method: "DELETE", url: "/modules/..%2Fother-route", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(400);
    expect(forwardToCourses).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("GET /courses/:id", () => {
  it("returns 401 with no token and never calls courses", async () => {
    const forwardToCourses = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCourses }));

    const response = await app.inject({ method: "GET", url: `/courses/${VALID_ID}` });

    expect(response.statusCode).toBe(401);
    expect(forwardToCourses).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards trusted headers derived from a valid token, any role", async () => {
    const forwardToCourses = vi.fn().mockResolvedValue({ status: 200, body: { id: VALID_ID, modules: [] } });
    const app = buildApp(createTestAppDeps({ forwardToCourses }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "GET", url: `/courses/${VALID_ID}`, headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(forwardToCourses).toHaveBeenCalledWith("GET", `/courses/${VALID_ID}`, { headers: { "x-user-id": "u1", "x-user-role": "student" } });
    await app.close();
  });

  it("rejects a malformed, non-UUID id with a 400 rather than forwarding it", async () => {
    const forwardToCourses = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCourses }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "GET", url: "/courses/not-a-uuid", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(400);
    expect(forwardToCourses).not.toHaveBeenCalled();
    await app.close();
  });
});
