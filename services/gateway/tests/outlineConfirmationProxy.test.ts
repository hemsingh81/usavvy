import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createTestAppDeps } from "./testHelpers.js";

const CUSTOM_COURSE_ID = "019fd450-b7cb-7a32-b021-42788045c71f";

async function authedApp(deps: Parameters<typeof createTestAppDeps>[0] = {}) {
  const app = buildApp(createTestAppDeps(deps));
  await app.ready();
  const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });
  return { app, token };
}

describe("POST /uploads/outline/:customCourseId/confirm (Story 2.13, AC #2)", () => {
  it("returns 401 with no token and never calls either service", async () => {
    const forwardToIngestion = vi.fn();
    const forwardToCourses = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToIngestion, forwardToCourses }));

    const response = await app.inject({ method: "POST", url: `/uploads/outline/${CUSTOM_COURSE_ID}/confirm` });

    expect(response.statusCode).toBe(401);
    expect(forwardToIngestion).not.toHaveBeenCalled();
    expect(forwardToCourses).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects an invalid customCourseId before calling either service", async () => {
    const forwardToIngestion = vi.fn();
    const forwardToCourses = vi.fn();
    const { app, token } = await authedApp({ forwardToIngestion, forwardToCourses });

    const response = await app.inject({
      method: "POST",
      url: "/uploads/outline/not-a-uuid/confirm",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    expect(forwardToIngestion).not.toHaveBeenCalled();
    expect(forwardToCourses).not.toHaveBeenCalled();
    await app.close();
  });

  it("the happy path: ingestion confirm -> courses create -> ingestion record, returns the new courseId", async () => {
    const topic = { id: "topic-1", title: "T", position: 0, priority: false, concepts: [] };
    const forwardToIngestion = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: { alreadyConfirmed: false, title: "My Notes", topics: [topic] } })
      .mockResolvedValueOnce({ status: 204, body: undefined });
    const forwardToCourses = vi.fn().mockResolvedValue({ status: 200, body: { courseId: "new-course-1" } });
    const { app, token } = await authedApp({ forwardToIngestion, forwardToCourses });

    const response = await app.inject({
      method: "POST",
      url: `/uploads/outline/${CUSTOM_COURSE_ID}/confirm`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ courseId: "new-course-1" });
    expect(forwardToIngestion).toHaveBeenNthCalledWith(1, "POST", "/uploads/outline/confirm", {
      body: { customCourseId: CUSTOM_COURSE_ID },
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    expect(forwardToCourses).toHaveBeenCalledWith("POST", "/courses/custom", {
      body: { title: "My Notes", topics: [topic] },
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    expect(forwardToIngestion).toHaveBeenNthCalledWith(2, "POST", "/uploads/outline/confirmations", {
      body: { customCourseId: CUSTOM_COURSE_ID, courseId: "new-course-1" },
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    await app.close();
  });

  it("the idempotent path: an already-confirmed outline short-circuits before ever calling courses", async () => {
    const forwardToIngestion = vi.fn().mockResolvedValue({ status: 200, body: { alreadyConfirmed: true, courseId: "existing-course-1" } });
    const forwardToCourses = vi.fn();
    const { app, token } = await authedApp({ forwardToIngestion, forwardToCourses });

    const response = await app.inject({
      method: "POST",
      url: `/uploads/outline/${CUSTOM_COURSE_ID}/confirm`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ courseId: "existing-course-1" });
    expect(forwardToIngestion).toHaveBeenCalledTimes(1);
    expect(forwardToCourses).not.toHaveBeenCalled();
    await app.close();
  });

  it("propagates an ingestion confirm failure (e.g. zero topics) without ever calling courses", async () => {
    const forwardToIngestion = vi.fn().mockResolvedValue({ status: 400, body: { error: { code: "VALIDATION_ERROR", message: "at least one Topic must remain to confirm this outline" } } });
    const forwardToCourses = vi.fn();
    const { app, token } = await authedApp({ forwardToIngestion, forwardToCourses });

    const response = await app.inject({
      method: "POST",
      url: `/uploads/outline/${CUSTOM_COURSE_ID}/confirm`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    expect(forwardToCourses).not.toHaveBeenCalled();
    await app.close();
  });

  it("propagates a courses-call failure and never calls the confirmations-recording endpoint", async () => {
    const topic = { id: "topic-1", title: "T", position: 0, priority: false, concepts: [] };
    const forwardToIngestion = vi.fn().mockResolvedValueOnce({ status: 200, body: { alreadyConfirmed: false, title: "My Notes", topics: [topic] } });
    const forwardToCourses = vi.fn().mockResolvedValue({ status: 500, body: { error: { code: "INTERNAL_ERROR", message: "failed" } } });
    const { app, token } = await authedApp({ forwardToIngestion, forwardToCourses });

    const response = await app.inject({
      method: "POST",
      url: `/uploads/outline/${CUSTOM_COURSE_ID}/confirm`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(500);
    expect(forwardToIngestion).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("still returns the courseId even if recording the confirmation afterward fails (Scope Note: an accepted small window)", async () => {
    const topic = { id: "topic-1", title: "T", position: 0, priority: false, concepts: [] };
    const forwardToIngestion = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: { alreadyConfirmed: false, title: "My Notes", topics: [topic] } })
      .mockResolvedValueOnce({ status: 500, body: { error: { code: "INTERNAL_ERROR", message: "failed" } } });
    const forwardToCourses = vi.fn().mockResolvedValue({ status: 200, body: { courseId: "new-course-2" } });
    const { app, token } = await authedApp({ forwardToIngestion, forwardToCourses });

    const response = await app.inject({
      method: "POST",
      url: `/uploads/outline/${CUSTOM_COURSE_ID}/confirm`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ courseId: "new-course-2" });
    await app.close();
  });
});
