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
  { id: 'lime', name: 'Lime Rush', cost: 500, paint: { body: 0x7bd23a, light: 0xb6f070, stripe: 0x1f4d12, plate: 0xffffff } },
  { id: 'sky', name: 'Sky Blue', cost: 500, paint: { body: 0x3aa0ff, light: 0x8fd0ff, stripe: 0xffffff, plate: 0xffffff } },
  { id: 'bubble', name: 'Bubblegum', cost: 900, paint: { body: 0xff6fb5, light: 0xffb0d8, stripe: 0x7a1f55, plate: 0xffffff } },
  { id: 'midnight', name: 'Midnight', cost: 1500, paint: { body: 0x23232f, light: 0x55556b, stripe: 0xf2c200, plate: 0xffffff } },
];

export const DEFAULT_SKIN = SKINS[0].id;

export function skinById(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}
