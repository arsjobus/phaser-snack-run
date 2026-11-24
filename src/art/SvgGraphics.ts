/**
 * An SVG recorder with the slice of Phaser's Graphics API that the art code (`src/art/*.ts`) uses
 * (pure TypeScript, no Phaser or DOM). Running a `draw*` function against it produces the same
 * picture as the in-game texture, as SVG text: that is how `npm run art:export` writes the files in
 * `public/art/`. Elements are emitted in draw order, so layering matches.
 */
export interface PointLike {
  x: number;
  y: number;
}

const n = (v: number): string => String(Math.round(v * 100) / 100);
const hex = (c: number): string => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;

export class SvgGraphics {
  private out: string[] = [];
  private fill = { color: 0, alpha: 1 };
  private line = { width: 1, color: 0, alpha: 1 };
  private path: string[] = [];

  fillStyle(color: number, alpha = 1): this {
    this.fill = { color, alpha };
    return this;
  }

  lineStyle(width: number, color: number, alpha = 1): this {
    this.line = { width, color, alpha };
    return this;
  }

  private f(): string {
    const { color, alpha } = this.fill;
    return `fill="${hex(color)}"${alpha < 1 ? ` fill-opacity="${n(alpha)}"` : ''}`;
  }

  private s(): string {
    const { width, color, alpha } = this.line;
    return `fill="none" stroke="${hex(color)}" stroke-width="${n(width)}"${alpha < 1 ? ` stroke-opacity="${n(alpha)}"` : ''}`;
  }

  fillRect(x: number, y: number, w: number, h: number): this {
    this.out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" ${this.f()}/>`);
    return this;
  }

  fillRoundedRect(x: number, y: number, w: number, h: number, r = 20): this {
    const rad = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    this.out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(rad)}" ${this.f()}/>`);
    return this;
  }

  fillCircle(x: number, y: number, r: number): this {
    this.out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" ${this.f()}/>`);
    return this;
  }

  strokeCircle(x: number, y: number, r: number): this {
    this.out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" ${this.s()}/>`);
    return this;
  }

  /** Phaser's ellipse takes the full width and height. */
  fillEllipse(x: number, y: number, w: number, h: number): this {
    this.out.push(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(w / 2)}" ry="${n(h / 2)}" ${this.f()}/>`);
    return this;
  }

  strokeEllipse(x: number, y: number, w: number, h: number): this {
    this.out.push(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(w / 2)}" ry="${n(h / 2)}" ${this.s()}/>`);
    return this;
  }

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): this {
    this.out.push(`<polygon points="${n(x0)},${n(y0)} ${n(x1)},${n(y1)} ${n(x2)},${n(y2)}" ${this.f()}/>`);
    return this;
  }

  lineBetween(x0: number, y0: number, x1: number, y1: number): this {
    this.out.push(`<line x1="${n(x0)}" y1="${n(y0)}" x2="${n(x1)}" y2="${n(y1)}" ${this.s()}/>`);
    return this;
  }

  private pts(points: readonly PointLike[]): string {
    return points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
  }

  fillPoints(points: readonly PointLike[]): this {
    this.out.push(`<polygon points="${this.pts(points)}" ${this.f()}/>`);
    return this;
  }

  strokePoints(points: readonly PointLike[], closeShape = false): this {
    const tag = closeShape ? 'polygon' : 'polyline';
    this.out.push(`<${tag} points="${this.pts(points)}" ${this.s()} stroke-linejoin="round"/>`);
    return this;
  }

  beginPath(): this {
    this.path = [];
    return this;
  }

  moveTo(x: number, y: number): this {
    this.path.push(`M${n(x)} ${n(y)}`);
    return this;
  }

  lineTo(x: number, y: number): this {
    this.path.push(`L${n(x)} ${n(y)}`);
    return this;
  }

  closePath(): this {
    this.path.push('Z');
    return this;
  }

  fillPath(): this {
    if (this.path.length) this.out.push(`<path d="${this.path.join(' ')}" ${this.f()}/>`);
    return this;
  }

  /** A pie slice (Phaser angles run clockwise on screen, y down). Filled by the next `fillPath`. */
  slice(x: number, y: number, r: number, start: number, end: number, anticlockwise = false): this {
    const sx = x + Math.cos(start) * r;
    const sy = y + Math.sin(start) * r;
    const ex = x + Math.cos(end) * r;
    const ey = y + Math.sin(end) * r;
    let sweep = anticlockwise ? start - end : end - start;
    sweep = ((sweep % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (sweep === 0 && end !== start) sweep = Math.PI * 2;
    const large = sweep > Math.PI ? 1 : 0;
    this.path = [`M${n(x)} ${n(y)}`, `L${n(sx)} ${n(sy)}`, `A${n(r)} ${n(r)} 0 ${large} ${anticlockwise ? 0 : 1} ${n(ex)} ${n(ey)}`, 'Z'];
    return this;
  }

  /** The finished document: `width` x `height` px, viewBox in the same units, origin top-left. */
  toSvg(width: number, height: number): string {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  ` +
      this.out.join('\n  ') +
      '\n</svg>\n'
    );
  }

  get elementCount(): number {
    return this.out.length;
  }
}
