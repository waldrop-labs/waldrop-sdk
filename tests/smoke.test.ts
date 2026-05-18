// tests/smoke.test.ts
import { describe, it, expect } from "vitest";
import { VERSION, PACKAGE_ID } from "../src/index";

describe("exports", () => {
  it("exposes VERSION", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("exposes PACKAGE_ID", () => {
    expect(PACKAGE_ID).toBeTypeOf("object");
  });
});
