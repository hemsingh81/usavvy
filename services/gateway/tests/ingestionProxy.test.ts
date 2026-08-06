import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createTestAppDeps } from "./testHelpers.js";

const BOUNDARY = "----testBoundary";
const MULTIPART_BODY = Buffer.from(
  `--${BOUNDARY}\r\nContent-Disposition: form-data; name="copyrightAttested"\r\n\r\ntrue\r\n--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--${BOUNDARY}--\r\n`,
);
const MULTIPART_CONTENT_TYPE = `multipart/form-data; boundary=${BOUNDARY}`;

describe("POST /uploads", () => {
  it("returns 401 with no token and never calls ingestion", async () => {
    const forwardMultipartToIngestion = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardMultipartToIngestion }));

    const response = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { "content-type": MULTIPART_CONTENT_TYPE },
      payload: MULTIPART_BODY,
    });

    expect(response.statusCode).toBe(401);
    expect(forwardMultipartToIngestion).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards the raw multipart body, exact content-type (boundary included), and trusted headers", async () => {
    const forwardMultipartToIngestion = vi.fn().mockResolvedValue({ status: 201, body: { id: "d1", status: "queued" } });
    const app = buildApp(createTestAppDeps({ forwardMultipartToIngestion }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { authorization: `Bearer ${token}`, "content-type": MULTIPART_CONTENT_TYPE },
      payload: MULTIPART_BODY,
    });

    expect(response.statusCode).toBe(201);
    expect(forwardMultipartToIngestion).toHaveBeenCalledWith(
      "/uploads",
      MULTIPART_CONTENT_TYPE,
      expect.any(Buffer),
      { "x-user-id": "u1", "x-user-role": "student" },
    );
    const [, , forwardedBody] = forwardMultipartToIngestion.mock.calls[0] as [string, string, Buffer, Record<string, string>];
    expect(forwardedBody.equals(MULTIPART_BODY)).toBe(true);
    await app.close();
  });

  it("rejects a non-multipart body before ever calling ingestion", async () => {
    const forwardMultipartToIngestion = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardMultipartToIngestion }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: { foo: "bar" },
    });

    expect(response.statusCode).toBe(400);
    expect(forwardMultipartToIngestion).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("GET /uploads", () => {
  it("returns 401 with no token and never calls ingestion", async () => {
    const forwardToIngestion = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToIngestion }));

    const response = await app.inject({ method: "GET", url: "/uploads?customCourseId=019fd450-b7cb-7a32-b021-42788045c71f" });

    expect(response.statusCode).toBe(401);
    expect(forwardToIngestion).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards the query string and trusted headers", async () => {
    const forwardToIngestion = vi.fn().mockResolvedValue({ status: 200, body: [] });
    const app = buildApp(createTestAppDeps({ forwardToIngestion }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({
      method: "GET",
      url: "/uploads?customCourseId=019fd450-b7cb-7a32-b021-42788045c71f",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(forwardToIngestion).toHaveBeenCalledWith("GET", "/uploads?customCourseId=019fd450-b7cb-7a32-b021-42788045c71f", {
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    await app.close();
  });
});
