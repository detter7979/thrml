export function roundUpTo30(minutes: number): number {
  if (minutes <= 0) return 30
  return Math.ceil(minutes / 30) * 30
}
