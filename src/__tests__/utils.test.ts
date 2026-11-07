import {
  calcNextInterval, parseApiError, sanitizeFilename, yamlStr, truncate,
  REVIEW_INTERVALS, parseReviewVerdict, parseExtractedConcepts,
} from "../utils";

// ─── calcNextInterval ─────────────────────────────────────────────────────────

describe("calcNextInterval", () => {
  test("fail always returns 1 day", () => {
    expect(calcNextInterval(0, false, false, false)).toBe(1);
    expect(calcNextInterval(2, false, false, false)).toBe(1);
  });

  test("normal pass returns the next interval", () => {
    expect(calcNextInterval(0, true, false, false)).toBe(REVIEW_INTERVALS[1]);
    expect(calcNextInterval(1, true, false, false)).toBe(REVIEW_INTERVALS[2]);
  });

  test("expert pass applies ×1.3 multiplier", () => {
    expect(calcNextInterval(0, true, false, true)).toBe(Math.round(7 * 1.3));
  });

  test("partial pass applies ×0.6 multiplier", () => {
    expect(calcNextInterval(0, true, true, false)).toBe(Math.max(1, Math.round(7 * 0.6)));
  });

  test("returns null when fully mastered (no more intervals)", () => {
    expect(calcNextInterval(2, true, false, false)).toBeNull();
  });
});

// ─── parseApiError ────────────────────────────────────────────────────────────

describe("parseApiError", () => {
  test("401 returns key error message", () => {
    expect(parseApiError(401, {})).toContain("API key");
  });

  test("404 returns endpoint error message", () => {
    expect(parseApiError(404, {})).toContain("endpoint");
  });

  test("429 returns rate limit message", () => {
    expect(parseApiError(429, {})).toContain("limit");
  });

  test("500+ returns service unavailable", () => {
    expect(parseApiError(500, {})).toContain("temporarily unavailable");
    expect(parseApiError(503, {})).toContain("temporarily unavailable");
  });

  test("quota message in body triggers balance error", () => {
    const result = parseApiError(400, { error: { message: "insufficient quota" } });
    expect(result).toContain("Insufficient quota");
  });

  test("unknown error falls back to HTTP status", () => {
    expect(parseApiError(418, {})).toContain("418");
  });
});

// ─── sanitizeFilename ─────────────────────────────────────────────────────────

describe("sanitizeFilename", () => {
  test("replaces forbidden chars with dash", () => {
    expect(sanitizeFilename("foo/bar:baz")).toBe("foo-bar-baz");
  });

  test("collapses multiple spaces", () => {
    expect(sanitizeFilename("foo  bar")).toBe("foo bar");
  });

  test("trims leading/trailing whitespace", () => {
    expect(sanitizeFilename("  hello  ")).toBe("hello");
  });
});

// ─── yamlStr ─────────────────────────────────────────────────────────────────

describe("yamlStr", () => {
  test("plain strings are returned as-is", () => {
    expect(yamlStr("hello")).toBe("hello");
  });

  test("strings with colons are quoted", () => {
    const result = yamlStr("key: value");
    expect(result.startsWith('"')).toBe(true);
  });

  test("double quotes inside are escaped", () => {
    const result = yamlStr('say "hi"');
    expect(result).toContain('\\"');
  });
});

// ─── truncate ─────────────────────────────────────────────────────────────────

describe("truncate", () => {
  test("short strings pass through unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  test("long strings are cut and appended with ellipsis", () => {
    const result = truncate("abcdef", 3);
    expect(result.startsWith("abc")).toBe(true);
    expect(result).toContain("…");
  });
});

// ─── parseReviewVerdict ───────────────────────────────────────────────────────

describe("parseReviewVerdict", () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => { warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { warnSpy.mockRestore(); });

  const validJson = JSON.stringify({
    passed: true,
    dimensions: [
      { label: "Clarity", score: "✓", note: "Clear expression" },
      { label: "Core mechanism", score: "△", note: "Missing detail" },
      { label: "Examples", score: "✓", note: "Good example" },
    ],
    feedback: "Overall solid",
  });

  test("parses clean JSON correctly", () => {
    const result = parseReviewVerdict(validJson);
    expect(result.passed).toBe(true);
    expect(result.dimensions).toHaveLength(3);
    expect(result.dimensions[0]).toEqual({ label: "Clarity", score: "✓", note: "Clear expression" });
    expect(result.feedback).toBe("Overall solid");
  });

  test("parses JSON wrapped in markdown fences", () => {
    const fenced = "```json\n" + validJson + "\n```";
    const result = parseReviewVerdict(fenced);
    expect(result.passed).toBe(true);
    expect(result.dimensions).toHaveLength(3);
  });

  test("invalid score value defaults to ✗", () => {
    const bad = JSON.stringify({
      passed: false,
      dimensions: [{ label: "Clarity", score: "INVALID", note: "" }],
      feedback: "",
    });
    const result = parseReviewVerdict(bad);
    expect(result.dimensions[0].score).toBe("✗");
  });

  test("falls back to regex parsing when no valid JSON", () => {
    const text = "Verdict: Pass\nClarity: ✓ good\nCore mechanism: △ needs more detail\nExamples: ✓ good\nFeedback: Strong overall";
    const result = parseReviewVerdict(text);
    expect(result.passed).toBe(true);
    expect(result.dimensions.find(d => d.label === "Clarity")?.score).toBe("✓");
    expect(result.dimensions.find(d => d.label === "Core mechanism")?.score).toBe("△");
    expect(result.feedback).toBe("Strong overall");
  });

  test("regex fallback: fail verdict", () => {
    const text = "Verdict: Fail\nCore mechanism: ✗ explanation weak\nFeedback: Keep practicing";
    const result = parseReviewVerdict(text);
    expect(result.passed).toBe(false);
    expect(result.dimensions.find(d => d.label === "Core mechanism")?.score).toBe("✗");
  });
});

// ─── parseExtractedConcepts ───────────────────────────────────────────────────

describe("parseExtractedConcepts", () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => { warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { warnSpy.mockRestore(); });

  const validArr = JSON.stringify([
    { name: "Compound interest", reason: "Core financial concept" },
    { name: "Marginal utility", reason: "Economics foundation" },
  ]);

  test("parses clean JSON array correctly", () => {
    const result = parseExtractedConcepts(validArr);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "Compound interest", reason: "Core financial concept" });
  });

  test("parses JSON array wrapped in markdown fences", () => {
    const fenced = "```json\n" + validArr + "\n```";
    const result = parseExtractedConcepts(fenced);
    expect(result).toHaveLength(2);
    expect(result[1].name).toBe("Marginal utility");
  });

  test("filters out items without a name", () => {
    const arr = JSON.stringify([{ reason: "no name here" }, { name: "Keep", reason: "" }]);
    const result = parseExtractedConcepts(arr);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Keep");
  });

  test("caps at 8 items", () => {
    const arr = JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ name: `Concept ${i}`, reason: "" })));
    const result = parseExtractedConcepts(arr);
    expect(result).toHaveLength(8);
  });

  test("falls back to text parsing with quoted format", () => {
    const text = '"Compound interest" - interest on interest\n"Marginal utility" - diminishing returns';
    const result = parseExtractedConcepts(text);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Compound interest");
    expect(result[0].reason).toBe("interest on interest");
  });

  test("text fallback: plain lines without 「」", () => {
    const text = "复利\n边际效用";
    const result = parseExtractedConcepts(text);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("复利");
    expect(result[0].reason).toBe("");
  });
});
