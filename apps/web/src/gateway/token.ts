export function normalizeReadToken(value: string): string {
  const unpadded = value.trim().replace(/=+$/, '')
  const remainder = unpadded.length % 4
  if (remainder === 2) return `${unpadded}==`
  if (remainder === 3) return `${unpadded}=`
  return unpadded
}
