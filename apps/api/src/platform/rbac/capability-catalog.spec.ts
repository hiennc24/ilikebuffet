/**
 * Guards that the capability catalog (VN labels + groups) stays in sync with the
 * capabilities the code actually enforces (ROLE_CAPABILITIES). A capability missing
 * from the catalog would render raw (e.g. "branch:dashboard:read") in the admin UI.
 */
import { CAPABILITY_CATALOG, ALL_CAPABILITIES, capabilityLabel } from "./capability-catalog";
import { ROLE_CAPABILITIES } from "./permissions";

describe("capability catalog", () => {
  it("has no duplicate capabilities across groups", () => {
    expect(new Set(ALL_CAPABILITIES).size).toBe(ALL_CAPABILITIES.length);
  });

  it("covers every capability used by the default role matrix", () => {
    const used = new Set<string>();
    for (const caps of Object.values(ROLE_CAPABILITIES)) for (const c of caps) used.add(c);
    const missing = [...used].filter((c) => !ALL_CAPABILITIES.includes(c as (typeof ALL_CAPABILITIES)[number]));
    expect(missing).toEqual([]);
  });

  it("gives every catalogued capability a Vietnamese label (not the raw key)", () => {
    for (const cap of ALL_CAPABILITIES) {
      const label = capabilityLabel(cap);
      expect(label).not.toBe(cap);
      expect(label.length).toBeGreaterThan(0);
    }
    // Every group has a Vietnamese label too.
    for (const g of CAPABILITY_CATALOG) expect(g.label.length).toBeGreaterThan(0);
  });
});
