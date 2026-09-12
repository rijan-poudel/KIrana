/**
 * App-wide constants. All values are plain data — safe to import from both
 * server and client components.
 */

export const APP_NAME = "Milan Grocery";
export const APP_LOCATION = "Gaindakot, Nawalparasi, Nepal";

/** Base units a product's stock can be tracked in. */
export const BASE_UNITS = ["pcs", "kg", "liter"] as const;

/** Default low-stock threshold offered for new products (base units). */
export const DEFAULT_LOW_STOCK_AT = 10;

/**
 * Ready-made pack units offered per base unit when editing a product.
 * Factor = base units contained in one of the unit.
 */
export const UNIT_PRESETS: Record<string, { name: string; factor: number }[]> = {
  pcs: [
    { name: "Dozen", factor: 12 },
    { name: "Pack", factor: 10 },
    { name: "Carton", factor: 30 },
  ],
  kg: [
    { name: "gram", factor: 0.001 },
    { name: "Bora (5kg)", factor: 5 },
    { name: "Quintal", factor: 100 },
  ],
  liter: [
    { name: "ml", factor: 0.001 },
    { name: "Carton (12)", factor: 12 },
  ],
};

/** localStorage key that keeps the active bill alive across page refreshes. */
export const CART_STORAGE_KEY = "milan-grocery-cart-v2";
