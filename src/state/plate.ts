import { useCallback, useEffect, useMemo, useState } from "react";
import { emptyMeal, emptyPlate, plateLabel, storage } from "../lib/storage";
import type { Food, Macros, Meal, Plate, PlateItem, SavedMeal } from "../types";

export const PORTION_STEP = 0.5;
export const MAX_PORTIONS = 20;
export const MAX_PLATES = 6;

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

export function mealTotals(plates: Plate[]): Macros {
  return plates.reduce<Macros>(
    (sum, plate) => {
      const t = totalsFor(plate.items);
      return {
        calories: sum.calories + t.calories,
        protein: sum.protein + t.protein,
        carbs: sum.carbs + t.carbs,
        fat: sum.fat + t.fat,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function newKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function addToItems(items: PlateItem[], food: Food, amount: number): PlateItem[] {
  const existing = items.findIndex((i) => i.food.id === food.id);
  if (existing !== -1) {
    const next = [...items];
    next[existing] = {
      ...next[existing],
      portions: roundPortions(next[existing].portions + amount),
    };
    return next;
  }
  return [...items, { key: newKey(), food, portions: amount }];
}

function updateActive(
  meal: Meal,
  updater: (items: PlateItem[]) => PlateItem[],
): Meal {
  return {
    ...meal,
    plates: meal.plates.map((p) =>
      p.id === meal.activePlateId ? { ...p, items: updater(p.items) } : p,
    ),
  };
}

/** Multi-plate meal: first plate, seconds, thirds — plus a running meal total. */
export function useMeal() {
  const [meal, setMeal] = useState<Meal>(() => storage.getMeal());

  useEffect(() => {
    storage.setMeal(meal);
  }, [meal]);

  const activePlate =
    meal.plates.find((p) => p.id === meal.activePlateId) ?? meal.plates[0];

  const plateTotals = useMemo(
    () => totalsFor(activePlate?.items ?? []),
    [activePlate],
  );

  const totals = useMemo(() => mealTotals(meal.plates), [meal.plates]);

  const plateSummaries = useMemo(
    () =>
      meal.plates.map((p) => ({
        id: p.id,
        label: p.label,
        itemCount: p.items.length,
        totals: totalsFor(p.items),
      })),
    [meal.plates],
  );

  const addFood = useCallback((food: Food, portions: number) => {
    const amount = roundPortions(portions);
    storage.pushRecent(food.id);
    setMeal((prev) => updateActive(prev, (items) => addToItems(items, food, amount)));
  }, []);

  const setPortions = useCallback((key: string, portions: number) => {
    setMeal((prev) =>
      updateActive(prev, (items) =>
        items.map((i) =>
          i.key === key ? { ...i, portions: roundPortions(portions) } : i,
        ),
      ),
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setMeal((prev) =>
      updateActive(prev, (items) => items.filter((i) => i.key !== key)),
    );
  }, []);

  const setActivePlate = useCallback((id: string) => {
    setMeal((prev) =>
      prev.plates.some((p) => p.id === id)
        ? { ...prev, activePlateId: id }
        : prev,
    );
  }, []);

  /** Start an empty plate for seconds / thirds. Switches focus to it. */
  const addPlate = useCallback(() => {
    setMeal((prev) => {
      if (prev.plates.length >= MAX_PLATES) return prev;
      const plate = emptyPlate(prev.plates.length);
      // Keep labels in sync if user deleted a middle plate earlier.
      const plates = [
        ...prev.plates.map((p, i) => ({ ...p, label: plateLabel(i) })),
        { ...plate, label: plateLabel(prev.plates.length) },
      ];
      return { plates, activePlateId: plates[plates.length - 1].id };
    });
  }, []);

  const removePlate = useCallback((id: string) => {
    setMeal((prev) => {
      if (prev.plates.length <= 1) {
        // Clearing the only plate just empties it.
        return {
          plates: [{ ...prev.plates[0], items: [] }],
          activePlateId: prev.plates[0].id,
        };
      }
      const plates = prev.plates
        .filter((p) => p.id !== id)
        .map((p, i) => ({ ...p, label: plateLabel(i) }));
      const activePlateId =
        prev.activePlateId === id
          ? plates[plates.length - 1].id
          : plates.find((p) => p.id === prev.activePlateId)?.id ?? plates[0].id;
      return { plates, activePlateId };
    });
  }, []);

  const clearActivePlate = useCallback(() => {
    setMeal((prev) => updateActive(prev, () => []));
  }, []);

  /** Save the whole meal (every plate) to history and start fresh. */
  const finishMeal = useCallback(() => {
    setMeal((prev) => {
      const nonEmpty = prev.plates.filter((p) => p.items.length);
      if (nonEmpty.length) {
        const saved: SavedMeal = {
          id: newKey(),
          savedAt: new Date().toISOString(),
          plates: nonEmpty.map((p) => ({
            label: p.label,
            items: p.items,
            totals: totalsFor(p.items),
          })),
          totals: mealTotals(nonEmpty),
        };
        storage.pushHistory(saved);
      }
      return emptyMeal();
    });
  }, []);

  return {
    meal,
    plates: meal.plates,
    activePlate,
    items: activePlate?.items ?? [],
    /** Totals for the plate you're editing. */
    plateTotals,
    /** Cumulative totals across every plate in this meal. */
    totals,
    plateSummaries,
    addFood,
    setPortions,
    removeItem,
    setActivePlate,
    addPlate,
    removePlate,
    clearActivePlate,
    finishMeal,
  };
}

/** @deprecated Prefer useMeal — kept so older imports keep typechecking briefly. */
export const usePlate = useMeal;

export type MealApi = ReturnType<typeof useMeal>;
export type PlateApi = MealApi;
