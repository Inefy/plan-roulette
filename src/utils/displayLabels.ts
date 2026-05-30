// src/utils/displayLabels.ts
const inclusiveLabels: Record<string, string> = {
  cheap: 'Budget-friendly',
  free: 'Free',
  medium: 'Moderate',
  splurge: 'Special occasion',
};

export function toDisplayLabel(value: string) {
  return (
    inclusiveLabels[value] ??
    value
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}
