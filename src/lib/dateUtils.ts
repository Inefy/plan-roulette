export type DateFormatOptions = {
  fallback?: string;
  locale?: Intl.LocalesArgument;
  timeZone?: string;
};

export function parseTimestamp(value: string | null | undefined) {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function compareTimestampDesc(leftValue: string | null | undefined, rightValue: string | null | undefined) {
  const leftTimestamp = parseTimestamp(leftValue);
  const rightTimestamp = parseTimestamp(rightValue);

  if (leftTimestamp === undefined && rightTimestamp === undefined) {
    return 0;
  }

  if (leftTimestamp === undefined) {
    return 1;
  }

  if (rightTimestamp === undefined) {
    return -1;
  }

  return rightTimestamp - leftTimestamp;
}

export function sortByTimestampDesc<Item>(items: readonly Item[], getTimestamp: (item: Item) => string | null | undefined) {
  return [...items].sort((left, right) => compareTimestampDesc(getTimestamp(left), getTimestamp(right)));
}

export function formatRelativeDate(value: string, nowMs = Date.now()) {
  const timestamp = parseTimestamp(value);

  if (timestamp === undefined) {
    return 'Recently updated';
  }

  const elapsedMinutes = Math.max(0, Math.floor((nowMs - timestamp) / 60000));

  if (elapsedMinutes < 1) {
    return 'Updated just now';
  }

  if (elapsedMinutes < 60) {
    return `Updated ${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `Updated ${elapsedHours} hr ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);

  return `Updated ${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`;
}

export function formatShortDate(value: string, options?: DateFormatOptions) {
  const timestamp = parseTimestamp(value);

  if (timestamp === undefined) {
    return options?.fallback ?? 'Recently';
  }

  return new Intl.DateTimeFormat(options?.locale, {
    day: 'numeric',
    month: 'short',
    timeZone: options?.timeZone,
    year: 'numeric',
  }).format(new Date(timestamp));
}

export function formatDateTime(value: string, options?: DateFormatOptions) {
  const timestamp = parseTimestamp(value);

  if (timestamp === undefined) {
    return options?.fallback ?? value;
  }

  return new Intl.DateTimeFormat(options?.locale, {
    dateStyle: 'medium',
    timeZone: options?.timeZone,
    timeStyle: 'short',
  }).format(new Date(timestamp));
}
