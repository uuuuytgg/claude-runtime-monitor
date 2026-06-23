import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const componentFiles = [
  "AICore.tsx",
  "ContextMeter.tsx",
  "CostDisplay.tsx",
  "Dashboard.tsx",
  "EventTimeline.tsx",
  "ModelInfo.tsx",
  "QuotaCard.tsx",
  "StatusHeader.tsx",
];

const mojibakeMarkers = ["绂", "鍑", "鎬", "鏉", "鈻", "馃", "楼"];

describe("dashboard source readability", () => {
  it("does not ship mojibake UI copy in dashboard components", () => {
    for (const file of componentFiles) {
      const source = readFileSync(
        resolve(import.meta.dirname, file),
        "utf8"
      );

      for (const marker of mojibakeMarkers) {
        expect(source, `${file} contains mojibake marker ${marker}`).not.toContain(
          marker
        );
      }
    }
  });
});
