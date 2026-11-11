/** Illustrative contraction, not a measured cardiac waveform. */
export function pulseScale(
  seconds: number,
  beatsPerMinute: number,
  amplitude: number,
) {
  const phase = ((seconds * beatsPerMinute) / 60) % 1;
  const contraction = Math.exp(-Math.pow((phase - 0.23) / 0.13, 2));
  return 1 - amplitude * contraction;
}
