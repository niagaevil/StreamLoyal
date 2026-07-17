import { describe, expect, it } from "vitest";
import { resolveChanceGame, selectWeightedIndex } from "./engagement";

describe("chance games", () => {
  it("charges the wager on a loss", () => {
    expect(resolveChanceGame(100, 2, 0.48, 0.9)).toEqual({
      amount: 100,
      won: false,
      grossPrize: 0,
      delta: -100,
    });
  });

  it("returns the gross prize and net delta on a win", () => {
    expect(resolveChanceGame(100, 3, 0.25, 0.1)).toEqual({
      amount: 100,
      won: true,
      grossPrize: 300,
      delta: 200,
    });
  });

  it("normalizes invalid values and clamps chance", () => {
    expect(resolveChanceGame(0, 2, 5, 0.99).amount).toBe(1);
    expect(resolveChanceGame(10, 2, -1, 0).won).toBe(false);
  });
});

describe("weighted giveaway draw", () => {
  it("picks entries proportionally to their weight", () => {
    // Pesos 1, 3, 6 => faixas [0, 0.1), [0.1, 0.4), [0.4, 1.0)
    expect(selectWeightedIndex([1, 3, 6], 0.05)).toBe(0);
    expect(selectWeightedIndex([1, 3, 6], 0.2)).toBe(1);
    expect(selectWeightedIndex([1, 3, 6], 0.99)).toBe(2);
  });

  it("returns -1 when there is no eligible weight", () => {
    expect(selectWeightedIndex([], 0.5)).toBe(-1);
    expect(selectWeightedIndex([0, 0], 0.5)).toBe(-1);
  });

  it("ignores negative weights and clamps random into range", () => {
    expect(selectWeightedIndex([-5, 10], 0)).toBe(1);
    expect(selectWeightedIndex([1, 1], 1)).toBe(1);
    expect(selectWeightedIndex([1, 1], -1)).toBe(0);
  });
});
