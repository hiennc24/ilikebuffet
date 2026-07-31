import { captureBeforeAfter } from "./capture-before-after";

describe("captureBeforeAfter", () => {
  it("create: null before -> full after", () => {
    expect(captureBeforeAfter(null, { name: "A", price: 100 })).toEqual({
      before: null,
      after: { name: "A", price: 100 },
    });
  });

  it("delete: null after -> full before", () => {
    expect(captureBeforeAfter({ name: "A" }, null)).toEqual({
      before: { name: "A" },
      after: null,
    });
  });

  it("update: only changed keys on both sides", () => {
    const diff = captureBeforeAfter(
      { name: "A", price: 100, active: true },
      { name: "A", price: 150, active: true },
    );
    expect(diff).toEqual({ before: { price: 100 }, after: { price: 150 } });
  });

  it("update with no changes -> empty diff objects", () => {
    expect(captureBeforeAfter({ x: 1 }, { x: 1 })).toEqual({ before: {}, after: {} });
  });

  it("added key: absent side recorded as null (survives JSON)", () => {
    const diff = captureBeforeAfter({ a: 1 }, { a: 1, b: 2 });
    expect(diff).toEqual({ before: { b: null }, after: { b: 2 } });
    // The 'field was absent' signal must survive serialization, not vanish.
    expect(JSON.parse(JSON.stringify(diff.before))).toEqual({ b: null });
  });

  it("removed key: new side recorded as null", () => {
    const diff = captureBeforeAfter({ a: 1, b: 2 }, { a: 1 });
    expect(diff).toEqual({ before: { b: 2 }, after: { b: null } });
  });

  it("compares nested values structurally", () => {
    const diff = captureBeforeAfter({ meta: { k: 1 } }, { meta: { k: 2 } });
    expect(diff).toEqual({ before: { meta: { k: 1 } }, after: { meta: { k: 2 } } });
  });

  it("does not throw on BigInt snapshot values (audit must never break a tx)", () => {
    expect(() =>
      captureBeforeAfter({ total: BigInt(100) }, { total: BigInt(150) }),
    ).not.toThrow();
    const diff = captureBeforeAfter({ total: BigInt(100) }, { total: BigInt(150) });
    expect(diff.after).toEqual({ total: BigInt(150) });
  });
});
