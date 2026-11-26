/** Truck paint jobs sold in the garage. Colours only (pure data): `src/art/trucks.ts` draws them. */
export interface SkinPaint {
  body: number;
  light: number;
  stripe: number;
  /** Number-roundel background. */
  plate: number;
}

export interface Skin {
  id: string;
  name: string;
  /** Coins; the first skin is free and always owned. */
  cost: number;
  paint: SkinPaint;
}

export const SKINS: readonly Skin[] = [
  { id: 'sunny', name: 'Sunny', cost: 0, paint: { body: 0xf2c200, light: 0xffe066, stripe: 0xb83a1a, plate: 0xffffff } },
  { id: 'gray', name: 'Smoke', cost: 3000, paint: { body: 0x777d86, light: 0xb8bec6, stripe: 0x343941, plate: 0xffffff } },
  { id: 'lime', name: 'Lime Rush', cost: 4000, paint: { body: 0x7bd23a, light: 0xb6f070, stripe: 0x1f4d12, plate: 0xffffff } },
  { id: 'sky', name: 'Sky Blue', cost: 4000, paint: { body: 0x3aa0ff, light: 0x8fd0ff, stripe: 0xffffff, plate: 0xffffff } },
  { id: 'bubble', name: 'Bubblegum', cost: 5000, paint: { body: 0xff6fb5, light: 0xffb0d8, stripe: 0x7a1f55, plate: 0xffffff } },
  { id: 'red', name: 'Red Hot', cost: 6000, paint: { body: 0xd93636, light: 0xff7777, stripe: 0x751919, plate: 0xffffff } },
  { id: 'purple', name: 'Royal Purple', cost: 7000, paint: { body: 0x8739c7, light: 0xc07af2, stripe: 0x42156b, plate: 0xffffff } },
  { id: 'orange', name: 'Orange', cost: 7500, paint: { body: 0xf07820, light: 0xffb15c, stripe: 0x85340e, plate: 0xffffff } },
  { id: 'white', name: 'Creamy', cost: 8000, paint: { body: 0xe8e8e8, light: 0xffffff, stripe: 0x555a63, plate: 0xffffff } },
  { id: 'midnight', name: 'Midnight', cost: 8000, paint: { body: 0x23232f, light: 0x55556b, stripe: 0xf2c200, plate: 0xffffff } }
];

export const DEFAULT_SKIN = SKINS[0].id;

export function skinById(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}
