/** A dish from UGA's dining menus, with macros for one listed serving. */
export type Food = {
  id: number;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  /** Serving size as printed by dining services, e.g. "3" + "oz". */
  servingAmount: string;
  servingUnit: string;
  halls: string[];
  meals: string[];
};

export type Catalog = {
  generatedAt: string;
  weeksScanned: number;
  source: string;
  halls: string[];
  foods: Food[];
};

/** A label photo snapped on the line, waiting to be read. */
export type Capture = {
  id: string;
  /** Downscaled JPEG, base64 without the data-url prefix. */
  base64: string;
  takenAt: number;
};

/** One food on a plate, with how many servings were taken. */
export type PlateItem = {
  /** Unique per row so the same dish can be added twice if you want. */
  key: string;
  food: Food;
  portions: number;
};

export type Macros = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** One physical plate / trip through the line (first, seconds, thirds…). */
export type Plate = {
  id: string;
  label: string;
  items: PlateItem[];
};

/** Everything eaten in one sitting — one or more plates. */
export type Meal = {
  plates: Plate[];
  activePlateId: string;
};

export type SavedMeal = {
  id: string;
  savedAt: string;
  plates: { label: string; items: PlateItem[]; totals: Macros }[];
  totals: Macros;
};

/** @deprecated Kept so older localStorage history still parses. */
export type SavedPlate = {
  id: string;
  savedAt: string;
  items: PlateItem[];
  totals: Macros;
};
