/** Index of the pre-rendered frame (of `n` over a full turn) nearest to `angle` radians. */
export function rotationFrame(angle: number, n: number): number {
  const turn = Math.PI * 2;
  const a = ((angle % turn) + turn) % turn;
  return Math.round((a / turn) * n) % n;
}
