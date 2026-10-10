import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POSITION_GAP, planMove, positionAfter, type Positioned } from "./position";

const list = (...positions: number[]): Positioned[] => positions.map((position, i) => ({ id: `t${i + 1}`, position }));

/** Apply a plan to a list the way the services do, and return ids in display order. */
function applyPlan(siblings: Positioned[], movedId: string, afterId: string | null) {
  const plan = planMove(siblings, movedId, afterId);
  assert.ok(plan, "plan should not be null");
  const positions = new Map(siblings.map((s) => [s.id, s.position]));
  if (plan.rebalanced) for (const r of plan.rebalanced) positions.set(r.id, r.position);
  else positions.set(movedId, plan.position);
  return { plan, order: [...positions.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id) };
}

describe("positionAfter", () => {
  it("starts an empty list at one gap", () => {
    assert.equal(positionAfter(null), POSITION_GAP);
    assert.equal(positionAfter(undefined), POSITION_GAP);
  });
  it("appends one gap after the last item", () => {
    assert.equal(positionAfter(POSITION_GAP * 3), POSITION_GAP * 4);
  });
});

describe("planMove", () => {
  it("puts the item into an empty list", () => {
    const plan = planMove([], "x", null);
    assert.deepEqual(plan, { position: POSITION_GAP, rebalanced: null });
  });

  it("puts the item first when afterId is null", () => {
    const { order, plan } = applyPlan(list(1000, 2000), "x", null);
    assert.deepEqual(order, ["x", "t1", "t2"]);
    assert.equal(plan.rebalanced, null);
  });

  it("puts the item last when placed after the final item", () => {
    const { order } = applyPlan(list(1000, 2000), "x", "t2");
    assert.deepEqual(order, ["t1", "t2", "x"]);
  });

  it("puts the item between two neighbours using the midpoint (one row changes)", () => {
    const plan = planMove(list(1000, 2000, 3000), "x", "t1");
    assert.deepEqual(plan, { position: 1500, rebalanced: null });
  });

  it("returns null when afterId is not in the list", () => {
    assert.equal(planMove(list(1000), "x", "missing"), null);
  });

  it("renumbers the whole list when neighbours are too close", () => {
    const siblings = list(1000, 1000.00001, 5000);
    const { plan, order } = applyPlan(siblings, "x", "t1");
    assert.ok(plan.rebalanced, "expected a rebalance");
    assert.equal(plan.rebalanced.length, 4);
    assert.deepEqual(order, ["t1", "x", "t2", "t3"]);
    // gaps are restored
    assert.deepEqual(
      plan.rebalanced.map((r) => r.position),
      [1, 2, 3, 4].map((n) => n * POSITION_GAP),
    );
  });

  it("renumbers when repeatedly inserting at the very top squeezes the first position to ~0", () => {
    let siblings = list(POSITION_GAP);
    let rebalanced = false;
    for (let i = 0; i < 60 && !rebalanced; i++) {
      const { plan } = applyPlan(siblings, `n${i}`, null);
      if (plan.rebalanced) {
        rebalanced = true;
        assert.equal(plan.rebalanced[0]?.id, `n${i}`);
      } else {
        siblings = [{ id: `n${i}`, position: plan.position }, ...siblings];
      }
    }
    assert.ok(rebalanced, "positions should eventually rebalance instead of reaching zero");
  });

  it("keeps a stable order across many random moves", () => {
    // Property test: after any sequence of moves the displayed order equals the order we intended.
    let seed = 42;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

    let items: Positioned[] = list(...Array.from({ length: 8 }, (_, i) => (i + 1) * POSITION_GAP));
    let expected = items.map((i) => i.id);

    for (let step = 0; step < 500; step++) {
      const movedId = expected[Math.floor(rand() * expected.length)] as string;
      const rest = expected.filter((id) => id !== movedId);
      const afterIdx = Math.floor(rand() * (rest.length + 1)) - 1; // -1 = first
      const afterId = afterIdx === -1 ? null : (rest[afterIdx] as string);

      const siblings = items.filter((i) => i.id !== movedId).sort((a, b) => a.position - b.position);
      const plan = planMove(siblings, movedId, afterId);
      assert.ok(plan);

      const next = new Map(items.map((i) => [i.id, i.position]));
      if (plan.rebalanced) for (const r of plan.rebalanced) next.set(r.id, r.position);
      else next.set(movedId, plan.position);
      items = [...next.entries()].map(([id, position]) => ({ id, position }));

      expected = [...rest.slice(0, afterIdx + 1), movedId, ...rest.slice(afterIdx + 1)];
      const actual = [...items].sort((a, b) => a.position - b.position).map((i) => i.id);
      assert.deepEqual(actual, expected, `order diverged at step ${step}`);
    }
  });
});
