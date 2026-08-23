"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const format_1 = require("../src/utils/format");
(0, vitest_1.describe)("FloodGuard thresholds", () => {
    (0, vitest_1.it)("SAFE >15", () => (0, vitest_1.expect)((0, format_1.deriveLevel)({ water: { distanceCm: 16 } })).toBe("SAFE"));
    (0, vitest_1.it)("WARNING >12 <=15", () => (0, vitest_1.expect)((0, format_1.deriveLevel)({ water: { distanceCm: 14 } })).toBe("WARNING"));
    (0, vitest_1.it)("DANGER <=12", () => (0, vitest_1.expect)((0, format_1.deriveLevel)({ water: { distanceCm: 12 } })).toBe("DANGER"));
    (0, vitest_1.it)("UNKNOWN when missing", () => (0, vitest_1.expect)((0, format_1.deriveLevel)({ water: {} })).toBe("UNKNOWN"));
});
