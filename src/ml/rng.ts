/** mulberry32. Same seed, same sequence, in the browser and in Node. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleIndices(count: number, rng: () => number): Int32Array {
  const ids = new Int32Array(count);
  for (let i = 0; i < count; i++) ids[i] = i;
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = ids[i];
    ids[i] = ids[j];
    ids[j] = swap;
  }
  return ids;
}
