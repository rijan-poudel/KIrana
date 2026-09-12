/**
 * App-wide constants. All values are plain data — safe to import from both
 * server and client components.
 */

export const APP_NAME = "Milan Grocery";
export const APP_LOCATION = "Gaindakot, Nawalparasi, Nepal";

/** Stock at or below this quantity is flagged as low. */
export const LOW_STOCK_THRESHOLD = 10;

/** Units offered in the inventory form dropdown. */
export const UNITS = ["kg", "gram", "pcs", "packet", "liter", "ml", "dozen", "sack", "box", "bottle"];

/** Keywords matched against product names to build the quick-item grid on the billing screen. */
export const STAPLE_KEYWORDS = [
  "chiyapati",
  "rice",
  "oil",
  "dal",
  "sugar",
  "soap",
  "salt",
  "atta",
  "chiura",
  "tea",
  "milk",
  "noodles",
];

/** localStorage key that keeps the active bill alive across page refreshes. */
export const CART_STORAGE_KEY = "milan-grocery-cart-v1";
