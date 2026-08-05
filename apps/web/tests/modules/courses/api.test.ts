import { afterEach, describe, expect, it, vi } from "vitest";
import { createCoursesApi } from "../../../src/modules/courses/api.js";

describe("createCoursesApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("searchCatalog with no params sends a bare /courses request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const api = createCoursesApi("http://localhost:3000");
    await api.searchCatalog("a-token", {});

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/courses", expect.objectContaining({ method: "GET" }));
  });

  it("searchCatalog builds a query string from the given filters, omitting unset ones", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const api = createCoursesApi("http://localhost:3000");
    await api.searchCatalog("a-token", { subject: "Math", level: "beginner", q: "algebra" });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:3000/courses?subject=Math&level=beginner&q=algebra");
  });

  it("returns the parsed course list", async () => {
    const courses = [
      { id: "c1", title: "Intro to Algebra", description: null, subject: "Math", level: "beginner", estimatedDurationHours: 10, status: "published" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(courses) } as unknown as Response));

    const api = createCoursesApi("http://localhost:3000");
    const result = await api.searchCatalog("a-token", {});

    expect(result).toEqual(courses);
  });
});
