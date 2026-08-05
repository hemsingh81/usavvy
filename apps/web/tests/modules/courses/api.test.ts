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

  it("getCourse fetches GET /courses/:id and returns the parsed course (Story 2.3)", async () => {
    const course = {
      id: "c1",
      title: "Intro to Algebra",
      description: null,
      subject: "Math",
      level: "beginner",
      estimatedDurationHours: 10,
      status: "published",
      prerequisites: ["Basic arithmetic"],
      outcomes: ["Solve linear equations"],
      sampleBoardAssetRef: null,
      isPinnedToOlderVersion: false,
      latestVersionId: null,
      modules: [],
      createdAt: "2026-01-15T00:00:00.000Z",
      updatedAt: "2026-01-15T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(course) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const api = createCoursesApi("http://localhost:3000");
    const result = await api.getCourse("a-token", "c1");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/courses/c1", expect.objectContaining({ method: "GET" }));
    expect(result).toEqual(course);
  });

  it("getCustomization returns null (not a thrown error) when none has been saved yet (Story 2.4, AC #4)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { code: "NOT_FOUND", message: "no customization saved yet" } }),
      } as unknown as Response),
    );

    const api = createCoursesApi("http://localhost:3000");
    const result = await api.getCustomization("a-token", "c1");

    expect(result).toBeNull();
  });

  it("getCustomization returns the parsed customization when one exists", async () => {
    const customization = {
      courseId: "c1",
      deselectedTopicIds: ["t1"],
      priorityTopicIds: [],
      depth: "standard",
      explanationStyle: "concise",
      startingDifficultyTier: null,
      estimatedHours: 6,
      updatedAt: "2026-01-15T00:00:00.000Z",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(customization) } as unknown as Response));

    const api = createCoursesApi("http://localhost:3000");
    const result = await api.getCustomization("a-token", "c1");

    expect(result).toEqual(customization);
  });

  it("saveCustomization PUTs to /courses/:id/customization and returns the saved result", async () => {
    const customization = {
      courseId: "c1",
      deselectedTopicIds: [],
      priorityTopicIds: [],
      depth: "deep-dive",
      explanationStyle: "concise",
      startingDifficultyTier: null,
      estimatedHours: 9,
      updatedAt: "2026-01-15T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(customization) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const api = createCoursesApi("http://localhost:3000");
    const result = await api.saveCustomization("a-token", "c1", { depth: "deep-dive" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/courses/c1/customization",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ depth: "deep-dive" }) }),
    );
    expect(result).toEqual(customization);
  });

  it("saveCustomization lets a DEPENDENCY_CONFLICT error propagate with its details, rather than swallowing it", async () => {
    const conflicts = [{ topicId: "t1", topicTitle: "Basics", requiredByTopicId: "t2", requiredByTopicTitle: "Advanced" }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { code: "DEPENDENCY_CONFLICT", message: "conflict", details: conflicts } }),
      } as unknown as Response),
    );

    const api = createCoursesApi("http://localhost:3000");

    await expect(api.saveCustomization("a-token", "c1", { deselectedTopicIds: ["t1"] })).rejects.toMatchObject({
      code: "DEPENDENCY_CONFLICT",
    });
  });
});
