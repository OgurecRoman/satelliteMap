function pad(value) {
  return `${value}`.padStart(2, '0');
}

export function formatDateTimeLocalInput(date) {
  const value = date instanceof Date ? date : new Date(date);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(
    value.getMinutes()
  )}`;
}

export function parseDateTimeLocalInput(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTimestamp(date) {
  const value = date instanceof Date ? date : new Date(date);
  return value.toLocaleString();
}
