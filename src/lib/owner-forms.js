export function parseDurations(value) {
  const parts = value.split(',').map((part) => part.trim());
  if (!parts.length || parts.some((part) => !/^[1-9]\d*$/.test(part))) return null;
  const durations = parts.map(Number);
  if (durations.some((duration) => !Number.isInteger(duration) || duration > 65_535)
    || new Set(durations).size !== durations.length) return null;
  return durations;
}

export function parsePriceMinor(value) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  const [pesos, cents = ''] = value.replace(',', '.').split('.');
  const amount = Number(pesos) * 100 + Number(cents.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function priceInputValue(priceMinor) {
  return priceMinor == null ? '' : String(priceMinor / 100);
}

export function toLocalTime(value) {
  return `${value}:00`;
}

export function validPeriod(period) {
  return period.startTime < period.endTime;
}
