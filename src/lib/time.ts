export function parseStartTime(value: string): number | null {
  const input = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(input)) {
    const seconds = Number(input);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }
  const match = input.match(/^(\d+):([0-5]\d(?:\.\d+)?)$/);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export function formatStartTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return String(seconds);
  const minutes = Math.floor(seconds / 60);
  const remainder = Number((seconds % 60).toFixed(3));
  const padded = String(Math.floor(remainder)).padStart(2, '0') + (remainder % 1 ? String(remainder).slice(String(Math.floor(remainder)).length) : '');
  return `${String(minutes).padStart(2, '0')}:${padded}`;
}
