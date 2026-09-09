import { useCallback, useEffect, useMemo, useState } from "react";
import { storage } from "../lib/storage";
import type { Food, Macros, PlateItem, SavedPlate } from "../types";

export const PORTION_STEP = 0.5;
export const MAX_PORTIONS = 20;

export function roundPortions(value: number) {
  const snapped = Math.round(value / PORTION_STEP) * PORTION_STEP;
  return Math.min(MAX_PORTIONS, Math.max(PORTION_STEP, Number(snapped.toFixed(1))));
}

export function macrosFor(food: Food, portions: number): Macros {
  return {
    calories: food.calories * portions,
    protein: food.protein * portions,
    carbs: food.carbs * portions,
    fat: food.fat * portions,
  };
}

export function totalsFor(items: PlateItem[]): Macros {
  return items.reduce<Macros>(
    (sum, item) => {
      const m = macrosFor(item.food, item.portions);
      return {
        calories: sum.calories + m.calories,
        protein: sum.protein + m.protein,
        carbs: sum.carbs + m.carbs,
        fat: sum.fat + m.fat,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function newKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function usePlate() {
  const [items, setItems] = useState<PlateItem[]>(() => storage.getPlate());

  useEffect(() => {
    storage.setPlate(items);
  }, [items]);

  const addFood = useCallback((food: Food, portions: number) => {
    const amount = roundPortions(portions);
    storage.pushRecent(food.id);
    setItems((prev) => {
      // Scanning the same dish twice means a second helping, not a new row.
      const existing = prev.findIndex((i) => i.food.id === food.id);
      if (existing !== -1) {
        const next = [...prev];
        next[existing] = {
          ...next[existing],
          portions: roundPortions(next[existing].portions + amount),
        };
        return next;
      }
      return [...prev, { key: newKey(), food, portions: amount }];
    });
  }, []);

  const setPortions = useCallback((key: string, portions: number) => {
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, portions: roundPortions(portions) } : i)),
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const totals = useMemo(() => totalsFor(items), [items]);

  /** Save the plate to history and start a fresh one. */
  const finish = useCallback(() => {
    setItems((prev) => {
      if (prev.length) {
        const saved: SavedPlate = {
          id: newKey(),
          savedAt: new Date().toISOString(),
          items: prev,
          totals: totalsFor(prev),
        };
        storage.pushHistory(saved);
      }
      return [];
    });
  }, []);

  return { items, totals, addFood, setPortions, removeItem, clear, finish };
}

export type PlateApi = ReturnType<typeof usePlate>;
