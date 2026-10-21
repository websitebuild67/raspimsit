import { parseIso } from "./dates.js";

const MOSCOW_OFFSET_MS = 3 * 3600 * 1000;

function escapeText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  let result = "";
  let current = "";
  for (const char of line) {
    if (encoder.encode(current + char).length > 73) {
      result += `${current}\r\n `;
      current = char;
    } else {
      current += char;
    }
  }
  return result + current;
}

function stampFromLesson(date, time) {
  const parsed = parseIso(date);
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || ""));
  if (!parsed || !match) return null;
  const value = new Date(
    Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
      Number(match[1]),
      Number(match[2])
    ) - MOSCOW_OFFSET_MS
  );
  const iso = value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return iso;
}

function addMinutesToStamp(stamp, minutes) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
  if (!match) return stamp;
  const value = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]) + minutes,
      Number(match[6])
    )
  );
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildIcs(data) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rasp IMSIT//Schedule//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`ИМСИТ · ${data.entity.name}`)}`,
    "X-WR-TIMEZONE:Europe/Moscow"
  ];

  const generated = nowStamp();
  const lessons = data.lessons || [];

  lessons.forEach((lesson, index) => {
    if (!lesson.date || !lesson.start) return;
    const start = stampFromLesson(lesson.date, lesson.start);
    if (!start) return;
    const end = lesson.end
      ? stampFromLesson(lesson.date, lesson.end)
      : addMinutesToStamp(start, 90);
    const cancelled = /отмен/i.test(lesson.status || "");
    const descriptionParts = [
      lesson.teacher ? `Преподаватель: ${lesson.teacher}` : "",
      lesson.groups ? `Группы: ${lesson.groups}` : "",
      lesson.type ? `Тип: ${lesson.type}` : "",
      lesson.comment || ""
    ].filter(Boolean);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${data.entity.slug}-${lesson.date}-${lesson.start.replace(":", "")}-${index}@rasp-imsit`);
    lines.push(`DTSTAMP:${generated}`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end || addMinutesToStamp(start, 90)}`);
    lines.push(`SUMMARY:${escapeText(lesson.subject || "Занятие")}`);
    if (lesson.room) lines.push(`LOCATION:${escapeText(lesson.room)}`);
    if (descriptionParts.length) lines.push(`DESCRIPTION:${escapeText(descriptionParts.join("\n"))}`);
    lines.push(`STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`);
    if (lesson.type) lines.push(`CATEGORIES:${escapeText(lesson.type)}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export function downloadIcs(data) {
  if (!data?.lessons?.length) return false;
  const content = buildIcs(data);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `rasp-${data.entity.slug || "schedule"}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
