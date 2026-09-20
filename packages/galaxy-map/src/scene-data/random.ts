/**
 * A seeded 32-bit generator. The same seed gives the same sequence, so a scene-data
 * build is reproducible. The algorithm is mulberry32.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** The next 32-bit unsigned integer. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  /** The next value in [0, 1). */
  float(): number {
    return this.next() / 4294967296;
  }
}
