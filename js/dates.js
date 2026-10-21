const MSK = "Europe/Moscow";
const DAY_MS = 86400000;

export const WEEKDAYS_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
export const WEEKDAYS_FULL = [
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
  "воскресенье"
];

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря"
];

const MONTHS_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "мая",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек"
];

export function parseIso(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return null;
  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(value.getTime()) ? null : value;
}

export function toIso(value) {
  return value.toISOString().slice(0, 10);
}

export function addDays(iso, amount) {
  const value = parseIso(iso);
  if (!value) return null;
  value.setUTCDate(value.getUTCDate() + amount);
  return toIso(value);
}

export function mondayOf(iso) {
  const value = parseIso(iso);
  if (!value) return null;
  const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return toIso(value);
}

export function diffDays(from, to) {
  const start = parseIso(from);
  const end = parseIso(to);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

export function weekdayIndex(iso) {
  const value = parseIso(iso);
  return value ? (value.getUTCDay() + 6) % 7 : 0;
}

export function formatLongDate(iso) {
  const value = parseIso(iso);
  if (!value) return "";
  return `${value.getUTCDate()} ${MONTHS_GENITIVE[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}

export function formatShortDate(iso) {
  const value = parseIso(iso);
  if (!value) return "";
  return `${value.getUTCDate()} ${MONTHS_SHORT[value.getUTCMonth()]}`;
}

export function formatDayLabel(iso) {
  const value = parseIso(iso);
  if (!value) return "";
  return `${WEEKDAYS_SHORT[weekdayIndex(iso)]}, ${value.getUTCDate()} ${MONTHS_SHORT[value.getUTCMonth()]}`;
}

export function formatWeekRange(weekStart) {
  const start = parseIso(weekStart);
  const end = parseIso(addDays(weekStart, 6));
  if (!start || !end) return "";

  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${formatLongDate(weekStart)} — ${formatLongDate(toIso(end))}`;
  }

  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${MONTHS_GENITIVE[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  }

  return `${start.getUTCDate()} ${MONTHS_GENITIVE[start.getUTCMonth()]} — ${end.getUTCDate()} ${MONTHS_GENITIVE[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
}

export function formatUpdated(isoTimestamp) {
  if (!isoTimestamp) return "";
  const value = new Date(isoTimestamp);
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MSK,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(value);
}

export function mskNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MSK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = `${lookup.year}-${lookup.month}-${lookup.day}`;
  const time = `${lookup.hour}:${lookup.minute}`;
  return {
    date,
    time,
    minutes: timeToMinutes(time),
    weekday: weekdayIndex(date)
  };
}

export function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatTimeRange(start, end) {
  if (!start && !end) return "Время уточняется";
  if (!end) return start;
  return `${start}–${end}`;
}

export function formatTimeShort(value) {
  return String(value || "").replace(/:00$/, "");
}

export function academicWeek(weekOneStart, iso) {
  if (!weekOneStart || !iso) return null;
  const days = diffDays(weekOneStart, iso);
  if (days === null || days < 0) return null;
  return Math.floor(days / 7) + 1;
}

export function weekParity(weekNumber) {
  if (!weekNumber || weekNumber < 1) return null;
  return ((weekNumber - 1) % 2) + 1;
}

export function plural(value, forms) {
  const number = Math.abs(Number(value)) % 100;
  const last = number % 10;
  if (number > 10 && number < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

export function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && Boolean(parseIso(value));
}
