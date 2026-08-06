import { describe, expect, it } from "vitest";
import {
  confirmOutlineResponseSchema,
  mergeProposedConceptsInputSchema,
  proposedConceptResponseSchema,
  proposedTopicResponseSchema,
  renameProposedItemInputSchema,
  reorderProposedTopicsInputSchema,
  setProposedItemPriorityInputSchema,
} from "../src/proposedOutline.js";

const VALID_CONCEPT = {
  id: "c1",
  title: "Intro",
  position: 0,
  priority: false,
  sourcePageRangeStart: 1,
  sourcePageRangeEnd: 2,
  safetyFlagged: false,
};

const VALID_TOPIC = { id: "t1", title: "Chapter One", position: 0, priority: false, concepts: [VALID_CONCEPT] };

describe("proposedConceptResponseSchema / proposedTopicResponseSchema", () => {
  it("accepts a fully-populated topic with a nested concept", () => {
    expect(() => proposedTopicResponseSchema.parse(VALID_TOPIC)).not.toThrow();
  });

  it("accepts null source page ranges", () => {
    expect(() => proposedConceptResponseSchema.parse({ ...VALID_CONCEPT, sourcePageRangeStart: null, sourcePageRangeEnd: null })).not.toThrow();
  });

  it("rejects a concept missing priority", () => {
    const rest = Object.fromEntries(Object.entries(VALID_CONCEPT).filter(([key]) => key !== "priority"));
    expect(() => proposedConceptResponseSchema.parse(rest)).toThrow();
  });
});

describe("renameProposedItemInputSchema / setProposedItemPriorityInputSchema", () => {
  it("rejects an empty title", () => {
    expect(() => renameProposedItemInputSchema.parse({ title: "" })).toThrow();
  });

  it("accepts a boolean priority", () => {
    expect(() => setProposedItemPriorityInputSchema.parse({ priority: true })).not.toThrow();
  });
});

describe("reorderProposedTopicsInputSchema", () => {
  it("accepts a non-empty ordered list of uuids", () => {
    expect(() => reorderProposedTopicsInputSchema.parse({ orderedTopicIds: ["019fd450-b7cb-7a32-b021-42788045c71f"] })).not.toThrow();
  });

  it("rejects an empty list", () => {
    expect(() => reorderProposedTopicsInputSchema.parse({ orderedTopicIds: [] })).toThrow();
  });
});

describe("mergeProposedConceptsInputSchema", () => {
  it("accepts two distinct uuids", () => {
    expect(() =>
      mergeProposedConceptsInputSchema.parse({
        keepConceptId: "019fd450-b7cb-7a32-b021-42788045c71f",
        mergeConceptId: "019fd450-b7cb-7a32-b021-42788045c720",
      }),
    ).not.toThrow();
  });
});

describe("confirmOutlineResponseSchema", () => {
  it("accepts the already-confirmed shape", () => {
    expect(() => confirmOutlineResponseSchema.parse({ alreadyConfirmed: true, courseId: "course1" })).not.toThrow();
  });

  it("accepts the not-yet-confirmed shape with the full outline", () => {
    expect(() => confirmOutlineResponseSchema.parse({ alreadyConfirmed: false, title: "My course", topics: [VALID_TOPIC] })).not.toThrow();
  });

  it("rejects the not-yet-confirmed shape with zero topics", () => {
    expect(() => confirmOutlineResponseSchema.parse({ alreadyConfirmed: false, title: "My course", topics: [] })).toThrow();
  });
});
