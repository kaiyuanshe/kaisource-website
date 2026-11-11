/** @param {unknown} value
 * @returns {value is {format: (pattern: string) => string}}
 */
function hasFormatter(value) {
  return value !== null && typeof value === 'object' && 'format' in value && typeof value.format === 'function';
}

// Accept the actual date-picker formatters, native Dates, or serialized text.
// Unsupported input is rejected without pretending unknown objects are dates.
export function formatDateTime(date, time) {
  try {
    if (!date || !time) return '';
    if (hasFormatter(date) && hasFormatter(time)) {
      return `${date.format('YYYY-MM-DD')} ${time.format('HH:mm:ss')}`;
    }
    if (date instanceof Date && time instanceof Date) {
      return `${date.toISOString().split('T')[0]} ${time.toTimeString().split(' ')[0]}`;
    }
    if (typeof date === 'string' && typeof time === 'string') return `${date} ${time}`;
    return '';
  } catch {
    return '';
  }
}
