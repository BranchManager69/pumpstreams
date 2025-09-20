type FormatOptions = {
  style?: 'full' | 'time';
};

export function format(date: Date, options: FormatOptions = {}): string {
  const { style = 'full' } = options;
  if (Number.isNaN(date.getTime())) return 'Invalid date';

  if (style === 'time') {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
