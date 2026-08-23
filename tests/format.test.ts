import { describe, expect, it } from "vitest";
import { deriveLevel } from "../src/utils/format";
describe("FloodGuard thresholds", () => {
  it("SAFE >15", () => expect(deriveLevel({water:{distanceCm:16}})).toBe("SAFE"));
  it("WARNING >12 <=15", () => expect(deriveLevel({water:{distanceCm:14}})).toBe("WARNING"));
  it("DANGER <=12", () => expect(deriveLevel({water:{distanceCm:12}})).toBe("DANGER"));
  it("UNKNOWN when missing", () => expect(deriveLevel({water:{}})).toBe("UNKNOWN"));
});
