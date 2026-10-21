import {
  WEEKDAYS_FULL,
  WEEKDAYS_SHORT,
  academicWeek,
  addDays,
  formatDayLabel,
  formatLongDate,
  formatShortDate,
  formatTimeRange,
  formatUpdated,
  formatWeekRange,
  isIsoDate,
  mondayOf,
  mskNow,
  plural,
  timeToMinutes,
  weekdayIndex
} from "./dates.js";
import { downloadIcs } from "./ics.js";

const MODES = {
  groups: {
    entity: "Группа",
    plural: ["группа", "группы", "групп"],
    placeholder: "Начните вводить группу",
    searchMode: "student",
    field: "group"
  },
  teachers: {
    entity: "Преподаватель",
    plural: ["преподаватель", "преподавателя", "преподавателей"],
    placeholder: "Начните вводить фамилию",
    searchMode: "teacher",
    field: "teacher"
  },
  rooms: {
    entity: "Аудитория",
    plural: ["аудитория", "аудитории", "аудиторий"],
    placeholder: "Начните вводить аудиторию",
    searchMode: "room",
    field: "room"
  }
};

const MODE_ORDER = ["groups", "teachers", "rooms"];
const MAX_OPTIONS = 500;
const UPCOMING_LIMIT = 6;
const DAY_FORMS = ["день", "дня", "дней"];

const dom = Object.fromEntries(
  [
    "update-pill",
    "update-text",
    "refresh-button",
    "theme-button",
    "entity-eyebrow",
    "entity-title",
    "entity-meta",
    "study-form-field",
    "study-form",
    "picker-fields",
    "entity-label",
    "combobox",
    "entity-input",
    "entity-clear",
    "entity-popup",
    "entity-popup-hint",
    "entity-listbox",
    "entity-empty",
    "picker-note",
    "summary-grid",
    "today-value",
    "today-note",
    "week-value",
    "week-note",
    "next-label",
    "next-value",
    "next-note",
    "week-section",
    "week-eyebrow",
    "week-title",
    "week-subtitle",
    "prev-week",
    "today-button",
    "next-week",
    "date-jump",
    "export-button",
    "print-button",
    "share-button",
    "week-grid",
    "upcoming-section",
    "upcoming-list",
    "upcoming-today",
    "state-card",
    "state-icon",
    "state-title",
    "state-text",
    "state-actions",
    "data-status",
    "lesson-dialog",
    "dialog-close",
    "dialog-date",
    "dialog-title",
    "dialog-badges",
    "dialog-details",
    "dialog-comment",
    "toast"
  ].map((id) => [id, document.getElementById(id)])
);

const state = {
  index: null,
  forms: [],
  mode: "groups",
  form: "",
  query: "",
  entity: null,
  data: null,
  weekStart: null,
  pendingWeekStart: null,
  today: mskNow(),
  requestToken: 0,
  visibleEntries: [],
  activeOption: -1,
  currentWeekLessons: [],
  refreshing: false,
  toastTimer: null
};

init();

async function init() {
  bindEvents();
  startClock();

  const params = readParams();
  if (params.mode) state.mode = params.mode;
  if (params.form) state.form = params.form;
  state.pendingWeekStart = params.date && isIsoDate(params.date) ? mondayOf(params.date) : null;

  setModeUI();
  await loadIndex({ fresh: true, initialSlug: params.entity });
}

function bindEvents() {
  for (const tab of document.querySelectorAll(".mode-tab")) {
    tab.addEventListener("click", () => switchMode(tab.dataset.mode));
  }

  dom["study-form"].addEventListener("change", () => {
    state.form = dom["study-form"].value;
    renderEntityList();
    const entries = entriesForMode();
    const current = state.entity
      ? entries.find((entry) => entry.slug === state.entity.slug)
      : null;
    const next = current || entries.find((entry) => entry.scraped) || entries[0] || null;
    if (next) selectEntity(next);
    else handleEmptyMode();
  });

  dom["theme-button"].addEventListener("click", toggleTheme);
  dom["refresh-button"].addEventListener("click", refresh);
  dom["prev-week"].addEventListener("click", () => shiftWeek(-1));
  dom["next-week"].addEventListener("click", () => shiftWeek(1));
  dom["today-button"].addEventListener("click", goToToday);
  dom["upcoming-today"].addEventListener("click", goToToday);
  dom["export-button"].addEventListener("click", exportWeek);
  dom["print-button"].addEventListener("click", () => window.print());
  dom["share-button"].addEventListener("click", shareSchedule);

  dom["date-jump"].addEventListener("change", () => {
    const value = dom["date-jump"].value;
    if (!isIsoDate(value) || !state.data) return;
    state.weekStart = mondayOf(value);
    renderWeek();
    renderSummary();
    writeParams();
  });

  dom["entity-input"].addEventListener("focus", openPopup);
  dom["entity-input"].addEventListener("click", openPopup);
  dom["entity-input"].addEventListener("input", () => {
    state.query = dom["entity-input"].value;
    renderEntityList();
    openPopup();
  });
  dom["entity-input"].addEventListener("keydown", handleComboboxKey);
  dom["entity-clear"].addEventListener("click", clearSearch);

  document.addEventListener("pointerdown", (event) => {
    if (dom.combobox.contains(event.target)) return;
    if (!dom["entity-input"].value.trim() && state.entity) {
      dom["entity-input"].value = state.entity.name;
    }
    closePopup();
  });

  dom["dialog-close"].addEventListener("click", closeLessonDialog);
  dom["lesson-dialog"].addEventListener("click", (event) => {
    if (event.target === dom["lesson-dialog"]) closeLessonDialog();
  });
}

function startClock() {
  setInterval(() => {
    if (!state.data) return;
    const previousDate = state.today.date;
    state.today = mskNow();
    if (previousDate !== state.today.date) renderWeek();
    renderSummary();
    renderUpcoming();
  }, 60000);
}

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  return {
    mode: MODES[mode] ? mode : "",
    form: params.get("form") || "",
    entity: params.get("entity") || "",
    date: params.get("date") || ""
  };
}

function writeParams() {
  if (!state.index) return;
  const params = new URLSearchParams();
  params.set("mode", state.mode);
  if (state.mode === "groups" && state.form) params.set("form", state.form);
  if (state.entity?.slug) params.set("entity", state.entity.slug);
  if (state.weekStart) params.set("date", state.weekStart);
  const next = `${window.location.pathname}?${params.toString()}`;
  if (next === `${window.location.pathname}${window.location.search}`) return;
  try {
    window.history.replaceState(null, "", next);
  } catch {
    return;
  }
}

async function loadIndex({ fresh = false, initialSlug = "" } = {}) {
  try {
    const index = await fetchJson("data/index.json", { fresh });
    if (!index || typeof index !== "object" || !index.entities) {
      throw new Error("Некорректный index.json");
    }

    state.index = index;
    const declared = Array.isArray(index.studyForms) ? index.studyForms.filter(Boolean) : [];
    const seen = new Set(declared);
    for (const entry of index.entities.groups || []) {
      for (const form of studyFormsOf(entry)) seen.add(form);
    }
    state.forms = [...seen];
    if (state.form && !state.forms.includes(state.form)) state.form = "";
    if (state.mode !== "groups") state.form = "";

    populateForms();
    setModeUI();
    updateUpdatePill();

    const entries = entriesForMode();
    if (!entries.length) {
      handleEmptyMode();
      return true;
    }

    const wanted = [initialSlug, state.entity?.slug].find(
      (slug) => slug && entries.some((entry) => entry.slug === slug)
    );
    const entry =
      entries.find((item) => item.slug === wanted) ||
      entries.find((item) => item.scraped) ||
      entries[0];

    await selectEntity(entry, { keepCurrent: Boolean(wanted), force: fresh });
    return true;
  } catch (error) {
    state.index = null;
    updateUpdatePill(error);
    clearEntityContent();
    showState({
      kind: "error",
      title: "Не удалось открыть расписание",
      text:
        error.status === 404
          ? "Файл data/index.json ещё не создан. Запустите npm run scrape, затем обновите страницу."
          : `Проверьте соединение и повторите попытку. ${error.message}. Сайт должен быть открыт через npm run serve.`,
      actions: [
        { label: "Повторить", kind: "primary", onClick: () => loadIndex({ fresh: true }) },
        { label: "Открыть сайт ИМСИТ", href: "https://rasp.imsit.ru/", kind: "secondary" }
      ]
    });
    dom["picker-note"].textContent = "Список недоступен";
    return false;
  }
}

async function selectEntity(entry, { keepCurrent = false, force = false } = {}) {
  if (!entry) return;

  const same = !force && state.entity?.slug === entry.slug && Boolean(state.data);
  state.entity = entry;
  state.query = "";
  dom["entity-input"].value = entry.name;
  dom["entity-clear"].hidden = true;
  closePopup();
  renderEntityList();
  renderEntityChrome();

  if (state.pendingWeekStart) {
    state.weekStart = state.pendingWeekStart;
    state.pendingWeekStart = null;
  }

  writeParams();

  if (same) {
    closePopup();
    return;
  }

  await loadEntity(entry, { keepCurrent });
}

async function loadEntity(entry, { keepCurrent = false } = {}) {
  const token = ++state.requestToken;
  state.data = null;
  state.currentWeekLessons = [];

  hideContent();
  hideState();
  renderEntityChrome();
  updatePickerNote();
  showState({
    kind: "loading",
    title: "Загружаем расписание",
    text: `${MODES[state.mode].entity} «${entry.name}»`
  });

  const file = entry.file || `${state.mode}/${entry.slug}.json`;

  try {
    const data = await fetchJson(`data/${file}`);
    if (token !== state.requestToken) return;
    if (!data || !Array.isArray(data.lessons)) {
      throw new Error("В файле нет списка занятий");
    }

    state.data = data;
    if (!keepCurrent || !state.weekStart) {
      state.weekStart = state.weekStart || defaultWeekStart(data);
    }
    if (!isIsoDate(state.weekStart)) state.weekStart = defaultWeekStart(data);

    hideState();
    renderEntityChrome();
    populateDateLimits();
    renderAll();
    showContent();
    writeParams();
  } catch (error) {
    if (token !== state.requestToken) return;
    state.data = null;
    hideContent();
    renderEntityChrome();
    const missing = error.status === 404;
    showState({
      kind: missing ? "empty" : "error",
      title: missing ? "Расписание ещё не собрано" : "Не удалось загрузить расписание",
      text: missing
        ? `Для «${entry.name}» пока нет данных. Запустите npm run scrape -- --mode=${state.mode} --${MODES[state.mode].field}="${entry.name}" и обновите страницу.`
        : error.message,
      actions: [
        {
          label: "Повторить",
          kind: "primary",
          onClick: () => loadEntity(entry)
        },
        {
          label: "Открыть на сайте ИМСИТ",
          href: sourceUrlFor(entry),
          kind: "secondary"
        }
      ]
    });
    updatePickerNote();
    writeParams();
  }
}

function entriesForMode() {
  const entries = state.index?.entities?.[state.mode];
  if (!Array.isArray(entries)) return [];
  if (state.mode !== "groups" || !state.form) return entries;
  return entries.filter((entry) => studyFormsOf(entry).includes(state.form));
}

function studyFormsOf(entry) {
  if (Array.isArray(entry.studyForms) && entry.studyForms.length) return entry.studyForms;
  return entry.studyForm ? [entry.studyForm] : [];
}

function populateForms() {
  const select = dom["study-form"];
  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "Все формы";
  select.append(all);
  for (const form of state.forms) {
    const option = document.createElement("option");
    option.value = form;
    option.textContent = form;
    select.append(option);
  }
  select.value = state.mode === "groups" ? state.form : "";
}

function setModeUI() {
  for (const tab of document.querySelectorAll(".mode-tab")) {
    const active = tab.dataset.mode === state.mode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }

  dom["entity-label"].textContent = MODES[state.mode].entity;
  dom["entity-input"].placeholder = MODES[state.mode].placeholder;
  dom["entity-input"].setAttribute("aria-label", `${MODES[state.mode].entity}: поиск`);
  dom["study-form-field"].hidden = state.mode !== "groups";
  dom["picker-fields"].classList.toggle("is-single", state.mode !== "groups");
  renderEntityList();
  updatePickerNote();
}

async function switchMode(mode) {
  if (!MODES[mode] || mode === state.mode) return;

  state.mode = mode;
  state.form = "";
  state.query = "";
  state.activeOption = -1;
  state.entity = null;
  state.data = null;
  state.currentWeekLessons = [];
  dom["study-form"].value = "";
  dom["entity-input"].value = "";
  dom["entity-clear"].hidden = true;
  closePopup();
  setModeUI();
  hideState();
  hideContent();

  const entries = entriesForMode();
  if (!entries.length) {
    handleEmptyMode();
    writeParams();
    return;
  }

  const entry = entries.find((item) => item.scraped) || entries[0];
  await selectEntity(entry);
}

function renderEntityList() {
  const all = entriesForMode();
  const query = normalize(state.query.trim());
  const filtered = query ? all.filter((entry) => normalize(entry.name).includes(query)) : all;
  const visible = filtered.slice(0, MAX_OPTIONS);
  state.visibleEntries = visible;
  state.activeOption = -1;

  const listbox = dom["entity-listbox"];
  listbox.replaceChildren();
  const fragment = document.createDocumentFragment();

  visible.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = "entity-option";
    item.id = `entity-choice-${index}`;
    item.dataset.slug = entry.slug;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(entry.slug === state.entity?.slug));

    const dot = document.createElement("span");
    dot.className = `entity-dot${entry.scraped ? " has-data" : ""}`;
    dot.setAttribute("aria-hidden", "true");

    const main = document.createElement("span");
    main.className = "entity-option-main";

    const name = document.createElement("span");
    name.className = "entity-option-name";
    appendHighlight(name, entry.name);
    main.append(name);

    const meta = document.createElement("span");
    meta.className = "entity-option-meta";
    meta.textContent = entry.scraped
      ? `${entry.lessonCount || 0} зан.`
      : "нет данных";
    main.append(meta);

    item.append(dot, main);
    item.addEventListener("mousedown", (event) => event.preventDefault());
    item.addEventListener("click", () => selectEntity(entry));

    fragment.append(item);
  });

  listbox.append(fragment);
  const shown = visible.length;
  dom["entity-popup-hint"].textContent = query
    ? `Найдено: ${filtered.length}${filtered.length > shown ? ` · показаны первые ${shown}` : ""}`
    : `Всего: ${all.length} · с данными: ${all.filter((entry) => entry.scraped).length}`;
  dom["entity-empty"].hidden = filtered.length > 0;
  dom["entity-input"].setAttribute("aria-expanded", String(!dom["entity-popup"].hidden));
  dom["entity-input"].removeAttribute("aria-activedescendant");
}

function appendHighlight(container, name) {
  const query = state.query.trim();
  const source = name;
  const lowerSource = normalize(source);
  const lowerQuery = normalize(query);

  if (!query || !lowerQuery) {
    container.textContent = source;
    return;
  }

  let from = 0;
  let index = lowerSource.indexOf(lowerQuery, from);
  if (index < 0) {
    container.textContent = source;
    return;
  }

  while (index >= 0) {
    if (index > from) container.append(document.createTextNode(source.slice(from, index)));
    const mark = document.createElement("mark");
    mark.textContent = source.slice(index, index + lowerQuery.length);
    container.append(mark);
    from = index + lowerQuery.length;
    index = lowerSource.indexOf(lowerQuery, from);
  }
  if (from < source.length) container.append(document.createTextNode(source.slice(from)));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function openPopup() {
  if (!dom["entity-popup"].hidden) return;
  dom["entity-popup"].hidden = false;
  dom["entity-input"].setAttribute("aria-expanded", "true");
  if (!state.query.trim()) {
    const selected = dom["entity-listbox"].querySelector('[aria-selected="true"]');
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }
}

function closePopup() {
  if (dom["entity-popup"].hidden) return;
  dom["entity-popup"].hidden = true;
  dom["entity-input"].setAttribute("aria-expanded", "false");
  dom["entity-input"].removeAttribute("aria-activedescendant");
  for (const item of dom["entity-listbox"].querySelectorAll(".entity-option")) {
    item.classList.remove("is-active");
  }
  state.activeOption = -1;
}

function handleComboboxKey(event) {
  const options = [...dom["entity-listbox"].querySelectorAll(".entity-option")];

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (dom["entity-popup"].hidden) openPopup();
    if (!options.length) return;
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const base = state.activeOption < 0 ? (direction === 1 ? -1 : 0) : state.activeOption;
    state.activeOption = (base + direction + options.length) % options.length;
    applyActiveOption(options);
    return;
  }

  if (event.key === "Enter") {
    if (dom["entity-popup"].hidden) return;
    const index = state.activeOption >= 0 ? state.activeOption : 0;
    const entry = state.visibleEntries[index];
    if (entry) {
      event.preventDefault();
      selectEntity(entry);
    }
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closePopup();
    return;
  }

  if (event.key === "Tab") {
    closePopup();
  }
}

function applyActiveOption(options) {
  options.forEach((option, index) => {
    option.classList.toggle("is-active", index === state.activeOption);
  });
  const active = options[state.activeOption];
  if (!active) return;
  dom["entity-input"].setAttribute("aria-activedescendant", active.id);
  active.scrollIntoView({ block: "nearest" });
}

function clearSearch() {
  state.query = "";
  dom["entity-input"].value = "";
  dom["entity-clear"].hidden = true;
  renderEntityList();
  openPopup();
  dom["entity-input"].focus();
}

function updatePickerNote() {
  if (!state.index) {
    dom["picker-note"].textContent = "Загружаем список…";
    return;
  }
  const all = entriesForMode();
  const scraped = all.filter((entry) => entry.scraped).length;
  const total = `${all.length} ${plural(all.length, MODES[state.mode].plural)}`;
  const parts = [total, `с данными: ${scraped}`];
  if (state.mode === "groups" && state.form) parts.push(state.form);
  dom["picker-note"].textContent = parts.join(" · ");
}

function updateUpdatePill(error = null) {
  const pill = dom["update-pill"];
  const dot = pill.querySelector(".status-dot");
  pill.classList.remove("is-busy");

  if (error) {
    dot.classList.remove("is-idle");
    dot.classList.add("is-error");
    dom["update-text"].textContent = "Данные недоступны";
    pill.title = error.message;
    return;
  }

  if (!state.index) return;
  dot.classList.remove("is-error");
  const counts = state.index.counts || {};
  const scraped =
    (counts.groups?.scraped || 0) +
    (counts.teachers?.scraped || 0) +
    (counts.rooms?.scraped || 0);
  dot.classList.toggle("is-idle", scraped === 0);
  dom["update-text"].textContent =
    scraped === 0
      ? "Данные ещё не собраны"
      : formatUpdated(state.index.generatedAt);
  pill.title = [
    `Обновлено: ${formatUpdated(state.index.generatedAt)}`,
    `Групп: ${counts.groups?.scraped || 0} из ${counts.groups?.total || 0}`,
    `Преподавателей: ${counts.teachers?.scraped || 0} из ${counts.teachers?.total || 0}`,
    `Аудиторий: ${counts.rooms?.scraped || 0} из ${counts.rooms?.total || 0}`
  ].join(" · ");
}

function renderEntityChrome() {
  const entry = state.entity;
  const stats = state.data?.stats;
  const range = state.data?.range;
  const updated = state.data?.scrapedAt || entry?.updatedAt;
  const lessonCount = stats?.lessons ?? entry?.lessonCount ?? 0;
  const dayCount = stats?.days ?? entry?.days ?? 0;

  dom["entity-eyebrow"].textContent = `Расписание · ${MODES[state.mode].entity.toLowerCase()}`;
  dom["entity-title"].textContent = entry?.name || "Расписание ИМСИТ";
  dom["entity-meta"].replaceChildren();

  if (!entry) {
    document.title = "Расписание ИМСИТ";
    dom["data-status"].hidden = true;
    return;
  }

  if (state.mode === "groups") {
    const form = entry.studyForm || studyFormsOf(entry)[0];
    if (form) dom["entity-meta"].append(metaChip(form, { accent: true }));
  }

  if (lessonCount) {
    dom["entity-meta"].append(
      metaChip(plural(lessonCount, ["занятие", "занятия", "занятий"]), {
        strong: String(lessonCount)
      })
    );
  }

  if (dayCount) {
    dom["entity-meta"].append(
      metaChip(plural(dayCount, DAY_FORMS), { strong: String(dayCount) })
    );
  }

  if (range?.start && range?.end) {
    dom["entity-meta"].append(
      metaChip(`${formatShortDate(range.start)} — ${formatShortDate(range.end)}`, {
        title: `${formatLongDate(range.start)} — ${formatLongDate(range.end)}`
      })
    );
  }

  if (updated) {
    dom["entity-meta"].append(metaChip(`обновлено ${formatUpdatedShort(updated)}`));
  }

  if (!lessonCount) {
    dom["entity-meta"].append(metaChip(state.data ? "занятий нет" : "данных пока нет"));
  }

  document.title = `${entry.name} — Расписание ИМСИТ`;
  dom["data-status"].hidden = !state.data;
  if (state.data) {
    const source = state.index?.source || "https://rasp.imsit.ru/";
    const sourceHost = hostOf(source);
    dom["data-status"].textContent =
      `${lessonCount} ${plural(lessonCount, ["занятие", "занятия", "занятий"])} · ` +
      `${dayCount} ${plural(dayCount, DAY_FORMS)} · данные с ${sourceHost}` +
      (updated ? ` · обновлено ${formatUpdated(updated)}` : "");
  }
}

function metaChip(text, { strong = "", accent = false, title = "" } = {}) {
  const chip = document.createElement("span");
  chip.className = `meta-chip${accent ? " meta-chip--accent" : ""}`;
  if (strong) {
    const value = document.createElement("strong");
    value.textContent = strong;
    chip.append(value, ` ${text}`);
  } else {
    chip.textContent = text;
  }
  if (title) chip.title = title;
  return chip;
}

function formatUpdatedShort(iso) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(value);
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "rasp.imsit.ru";
  }
}

function renderAll() {
  renderWeek();
  renderSummary();
  renderUpcoming();
}

function renderWeek() {
  if (!state.data) return;

  const weekStart = state.weekStart || defaultWeekStart(state.data);
  state.weekStart = weekStart;
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const daySet = new Set(days);
  const grouped = new Map(days.map((date) => [date, []]));

  for (const lesson of state.data.lessons) {
    if (daySet.has(lesson.date)) grouped.get(lesson.date).push(lesson);
  }
  for (const lessons of grouped.values()) lessons.sort(compareLessons);

  const weekLessons = days.flatMap((date) => grouped.get(date));
  state.currentWeekLessons = weekLessons;
  const weekNumber = academicWeek(state.data.range?.weekOneStart, weekStart);
  const daysWithLessons = days.filter((date) => grouped.get(date).length).length;
  const isCurrentWeek = weekStart === mondayOf(state.today.date);

  dom["week-eyebrow"].textContent = weekNumber
    ? `${weekNumber}-я учебная неделя`
    : "Учебная неделя";
  dom["week-title"].textContent = formatWeekRange(weekStart);
  dom["week-subtitle"].textContent = [
    `${weekLessons.length} ${plural(weekLessons.length, ["занятие", "занятия", "занятий"])}`,
    `${daysWithLessons} ${plural(daysWithLessons, DAY_FORMS)}`,
    isCurrentWeek ? "текущая неделя" : ""
  ]
    .filter(Boolean)
    .join(" · ");
  dom["date-jump"].value = weekStart;

  const grid = dom["week-grid"];
  grid.replaceChildren();
  const fragment = document.createDocumentFragment();

  days.forEach((date, dayIndex) => {
    const lessons = grouped.get(date);
    const weekend = dayIndex >= 5;
    const today = date === state.today.date;
    const column = document.createElement("section");
    column.className = [
      "day-column",
      weekend ? "is-weekend" : "",
      today ? "is-today" : ""
    ]
      .filter(Boolean)
      .join(" ");

    const head = document.createElement("div");
    head.className = "day-head";
    const headMain = document.createElement("div");
    headMain.className = "day-head-main";
    const weekday = document.createElement("span");
    weekday.className = "day-weekday";
    weekday.textContent = WEEKDAYS_SHORT[dayIndex];
    const dateBox = document.createElement("span");
    dateBox.className = "day-date";
    const dayNumber = document.createElement("strong");
    dayNumber.textContent = String(Number(date.slice(8, 10)));
    const month = document.createElement("span");
    month.textContent = formatShortDate(date).replace(/^\d+\s*/, "");
    dateBox.append(dayNumber, month);
    headMain.append(weekday, dateBox);
    head.append(headMain);

    if (today) {
      const badge = document.createElement("span");
      badge.className = "day-badge";
      badge.textContent = "сегодня";
      head.append(badge);
    }

    const lessonsBox = document.createElement("div");
    lessonsBox.className = "day-lessons";

    if (!lessons.length) {
      const empty = document.createElement("div");
      empty.className = "day-empty";
      empty.textContent = "нет занятий";
      lessonsBox.append(empty);
    } else {
      for (const lesson of lessons) {
        lessonsBox.append(renderLessonCard(lesson));
      }
    }

    column.append(head, lessonsBox);
    fragment.append(column);
  });

  grid.append(fragment);
  updateExportState();
}

function renderLessonCard(lesson) {
  const info = typeInfo(lesson.type);
  const card = document.createElement("button");
  card.type = "button";
  card.className = `lesson-card lesson-card--${info.key}`;
  card.title = `${formatTimeRange(lesson.start, lesson.end)} · ${lesson.subject || "Занятие"}`;

  const time = document.createElement("div");
  time.className = "lesson-time";
  const start = document.createElement("strong");
  start.textContent = lesson.start || "—";
  time.append(start);
  if (lesson.end) {
    const end = document.createElement("span");
    end.textContent = lesson.end;
    time.append(end);
  }

  const subject = document.createElement("div");
  subject.className = "lesson-subject";
  subject.textContent = lesson.subject || "Занятие";

  const meta = document.createElement("div");
  meta.className = "lesson-meta";
  const tag = document.createElement("span");
  tag.className = "lesson-tag";
  tag.textContent = info.short;
  tag.title = info.label;
  meta.append(tag);

  if (lesson.room) {
    const room = document.createElement("span");
    room.className = "lesson-room";
    room.textContent = lesson.room;
    meta.append(room);
  }

  card.append(time, subject, meta);

  const extraText = lessonExtra(lesson);
  if (extraText) {
    const extra = document.createElement("div");
    extra.className = "lesson-extra";
    extra.textContent = extraText;
    extra.title = extraText;
    card.append(extra);
  }

  if (lesson.status) {
    const status = document.createElement("span");
    status.className = "lesson-status";
    status.textContent = lesson.status;
    card.append(status);
  }

  card.addEventListener("click", () => openLessonDialog(lesson));
  return card;
}

function lessonExtra(lesson) {
  if (state.mode === "groups") return lesson.teacher;
  if (state.mode === "teachers") return lesson.groups;
  return [lesson.teacher, lesson.groups].filter(Boolean).join(" · ");
}

function typeInfo(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (/^лаб/.test(value) || value.includes("лаборатор")) {
    return { key: "lab", short: "лаб", label: "Лабораторная работа" };
  }
  if (/^(л|лек)/.test(value) || value.includes("лекц")) {
    return { key: "lecture", short: "лек", label: "Лекция" };
  }
  if (/^(пр|практ|сем)/.test(value) || value.includes("практи")) {
    return { key: "practice", short: "практ", label: "Практика" };
  }
  return {
    key: "other",
    short: raw ? String(raw) : "зан",
    label: raw ? String(raw) : "Занятие"
  };
}

function compareLessons(a, b) {
  if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
  const startA = timeToMinutes(a.start);
  const startB = timeToMinutes(b.start);
  if (startA !== startB) {
    if (startA === null) return 1;
    if (startB === null) return -1;
    return startA - startB;
  }
  return String(a.subject || "").localeCompare(String(b.subject || ""), "ru");
}

function renderSummary() {
  if (!state.data) return;

  const lessons = state.data.lessons;
  const today = state.today;
  const todayLessons = lessons.filter((lesson) => lesson.date === today.date).sort(compareLessons);
  const todayCurrent = todayLessons.find((lesson) => isOngoing(lesson, today));
  const todayNext = todayLessons.find((lesson) => {
    const start = timeToMinutes(lesson.start);
    return start !== null && start > today.minutes;
  });

  dom["today-value"].textContent = todayLessons.length
    ? `${todayLessons.length} ${plural(todayLessons.length, ["занятие", "занятия", "занятий"])}`
    : "Нет занятий";
  dom["today-note"].textContent = todayLessons.length
    ? todayCurrent
      ? todayCurrent.end
        ? `сейчас · до ${todayCurrent.end}`
        : "сейчас идёт"
      : todayNext
        ? `следующее в ${todayNext.start}`
        : "на сегодня всё"
    : `${WEEKDAYS_FULL[weekdayIndex(today.date)]}, ${formatLongDate(today.date)}`;

  const weekLessons = state.currentWeekLessons;
  const weekNumber = academicWeek(state.data.range?.weekOneStart, state.weekStart);
  const weekDays = new Set(weekLessons.map((lesson) => lesson.date)).size;
  dom["week-value"].textContent = weekLessons.length
    ? `${weekLessons.length} ${plural(weekLessons.length, ["занятие", "занятия", "занятий"])}`
    : "Нет занятий";
  dom["week-note"].textContent = weekNumber
    ? `${weekNumber}-я учебная неделя · ${weekDays} ${plural(weekDays, DAY_FORMS)}`
    : `${weekDays} ${plural(weekDays, DAY_FORMS)}`;

  const ongoing = lessons.find((lesson) => isOngoing(lesson, today));
  const upcoming = ongoing || lessons.find((lesson) => isAfterNow(lesson, today));
  if (upcoming) {
    dom["next-label"].textContent = ongoing ? "Сейчас идёт" : "Следующая пара";
    dom["next-value"].textContent = upcoming.subject || "Занятие";
    const when = ongoing
      ? upcoming.end
        ? `до ${upcoming.end}`
        : "сейчас идёт"
      : upcoming.start
        ? `${formatDayLabel(upcoming.date)} · ${upcoming.start}`
        : formatDayLabel(upcoming.date);
    const place = upcoming.room ? ` · ${upcoming.room}` : "";
    dom["next-note"].textContent = `${when}${place}`;
    dom["next-note"].title = dom["next-note"].textContent;
    dom["next-note"].classList.add("summary-note--wrap");
  } else {
    dom["next-label"].textContent = "Следующая пара";
    dom["next-value"].textContent = "—";
    dom["next-note"].textContent = "занятий больше нет";
    dom["next-note"].classList.remove("summary-note--wrap");
  }
}

function isOngoing(lesson, today) {
  if (lesson.date !== today.date) return false;
  const start = timeToMinutes(lesson.start);
  if (start === null) return false;
  const end = timeToMinutes(lesson.end);
  return start <= today.minutes && (end === null || today.minutes < end);
}

function isAfterNow(lesson, today) {
  if (lesson.date > today.date) return true;
  if (lesson.date < today.date) return false;
  const start = timeToMinutes(lesson.start);
  if (start !== null && start >= today.minutes) return true;
  return isOngoing(lesson, today);
}

function renderUpcoming() {
  if (!state.data) {
    dom["upcoming-section"].hidden = true;
    return;
  }

  const today = state.today;
  const upcoming = state.data.lessons
    .filter((lesson) => isAfterNow(lesson, today))
    .sort(compareLessons)
    .slice(0, UPCOMING_LIMIT);

  if (!upcoming.length) {
    dom["upcoming-section"].hidden = true;
    dom["upcoming-list"].replaceChildren();
    return;
  }

  const list = dom["upcoming-list"];
  list.replaceChildren();
  const fragment = document.createDocumentFragment();

  for (const lesson of upcoming) {
    const info = typeInfo(lesson.type);
    const item = document.createElement("button");
    item.type = "button";
    item.className = "upcoming-item";

    const date = document.createElement("span");
    date.className = "upcoming-date";
    const weekday = document.createElement("span");
    weekday.textContent = WEEKDAYS_SHORT[weekdayIndex(lesson.date)];
    const day = document.createElement("strong");
    day.textContent = String(Number(lesson.date.slice(8, 10)));
    const month = document.createElement("span");
    month.textContent = formatShortDate(lesson.date).replace(/^\d+\s*/, "");
    date.append(weekday, day, month);

    const main = document.createElement("span");
    main.className = "upcoming-main";
    const subject = document.createElement("span");
    subject.className = "upcoming-subject";
    subject.textContent = lesson.subject || "Занятие";
    const meta = document.createElement("span");
    meta.className = "upcoming-meta";
    const place = state.mode === "groups" ? lesson.teacher : lesson.groups;
    meta.textContent = [
      info.label,
      lesson.room || "",
      place || ""
    ]
      .filter(Boolean)
      .join(" · ");
    main.append(subject, meta);

    const time = document.createElement("span");
    time.className = "upcoming-time";
    time.textContent = lesson.start || "—";

    item.append(date, main, time);
    item.addEventListener("click", () => openLessonDialog(lesson));
    fragment.append(item);
  }

  list.append(fragment);
  dom["upcoming-section"].hidden = false;
}

function openLessonDialog(lesson) {
  const dialog = dom["lesson-dialog"];
  const info = typeInfo(lesson.type);
  const weekNumber = academicWeek(state.data?.range?.weekOneStart, lesson.date);

  dom["dialog-date"].textContent =
    `${WEEKDAYS_FULL[weekdayIndex(lesson.date)]}, ${formatLongDate(lesson.date)}`;
  dom["dialog-title"].textContent = lesson.subject || "Занятие";

  const badges = dom["dialog-badges"];
  badges.replaceChildren();
  badges.append(dialogBadge(info.label, "type"));
  if (lesson.room) badges.append(dialogBadge(lesson.room));
  if (lesson.groups && state.mode !== "groups") badges.append(dialogBadge(lesson.groups));
  if (lesson.status) badges.append(dialogBadge(lesson.status, "danger"));

  const details = dom["dialog-details"];
  details.replaceChildren();
  addDetail(details, "Время", formatTimeRange(lesson.start, lesson.end));
  if (lesson.room) addDetail(details, "Аудитория", lesson.room);
  if (lesson.teacher) addDetail(details, "Преподаватель", lesson.teacher);
  if (lesson.groups) addDetail(details, "Группы", lesson.groups);
  if (weekNumber) addDetail(details, "Неделя", `${weekNumber}-я учебная неделя`);
  if (lesson.status) addDetail(details, "Статус", lesson.status);
  if (lesson.roomUrl) {
    addDetail(details, "Ссылка", lesson.roomUrl, {
      href: lesson.roomUrl,
      label: "Курс в ЭИОС"
    });
  }

  dom["dialog-comment"].hidden = !lesson.comment;
  dom["dialog-comment"].textContent = lesson.comment || "";

  if (!dialog.open) dialog.showModal();
}

function dialogBadge(text, variant = "") {
  const badge = document.createElement("span");
  badge.className = `dialog-badge${variant ? ` dialog-badge--${variant}` : ""}`;
  badge.textContent = text;
  return badge;
}

function addDetail(list, term, value, link = null) {
  if (!value) return;
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  if (link?.href) {
    const anchor = document.createElement("a");
    anchor.href = link.href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.label || link.href;
    dd.append(anchor);
  } else {
    dd.textContent = value;
  }
  list.append(dt, dd);
}

function closeLessonDialog() {
  if (dom["lesson-dialog"].open) dom["lesson-dialog"].close();
}

function defaultWeekStart(data) {
  const range = data?.range;
  const today = state.today.date;
  if (range?.start && range?.end && today >= range.start && today <= range.end) {
    return mondayOf(today);
  }
  const first = data?.lessons?.[0]?.date || range?.start || today;
  return mondayOf(first) || mondayOf(today);
}

function populateDateLimits() {
  const range = state.data?.range;
  const input = dom["date-jump"];
  if (range?.start && range?.end) {
    input.min = mondayOf(range.start) || range.start;
    input.max = range.end;
  } else {
    input.removeAttribute("min");
    input.removeAttribute("max");
  }
}

function shiftWeek(delta) {
  if (!state.data) return;
  const base = state.weekStart || defaultWeekStart(state.data);
  const next = addDays(base, delta * 7);
  if (!next) return;
  state.weekStart = next;
  renderWeek();
  renderSummary();
  writeParams();
}

function goToToday() {
  if (!state.data) return;
  state.weekStart = mondayOf(state.today.date) || defaultWeekStart(state.data);
  renderWeek();
  renderSummary();
  writeParams();
  dom["week-section"].scrollIntoView({ behavior: "smooth", block: "start" });
}

function exportWeek() {
  if (!state.data) return;
  if (!state.currentWeekLessons.length) {
    toast("На выбранной неделе нет занятий");
    return;
  }
  const scoped = { ...state.data, lessons: state.currentWeekLessons };
  if (downloadIcs(scoped)) {
    toast(`Экспортировано ${state.currentWeekLessons.length} ${plural(
      state.currentWeekLessons.length,
      ["занятие", "занятия", "занятий"]
    )}`);
  } else {
    toast("Не удалось создать файл");
  }
}

function updateExportState() {
  const disabled = !state.currentWeekLessons.length;
  dom["export-button"].disabled = disabled;
  dom["export-button"].title = disabled
    ? "На неделе нет занятий"
    : "Скачать .ics за выбранную неделю";
}

async function shareSchedule() {
  const title = state.entity
    ? `Расписание · ${state.entity.name}`
    : "Расписание ИМСИТ";
  const url = window.location.href;

  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast("Ссылка скопирована");
  } catch (error) {
    if (error?.name === "AbortError") return;
    try {
      await navigator.clipboard.writeText(url);
      toast("Ссылка скопирована");
    } catch {
      toast("Не удалось поделиться ссылкой");
    }
  }
}

async function refresh() {
  if (state.refreshing) return;
  state.refreshing = true;
  const button = dom["refresh-button"];
  button.classList.add("is-busy");
  button.disabled = true;
  dom["update-pill"].classList.add("is-busy");
  dom["update-text"].textContent = "Обновляем…";

  try {
    const ok = await loadIndex({ fresh: true });
    if (ok) toast("Данные обновлены");
  } finally {
    state.refreshing = false;
    button.classList.remove("is-busy");
    button.disabled = false;
    dom["update-pill"].classList.remove("is-busy");
  }
}

function handleEmptyMode() {
  state.entity = null;
  state.data = null;
  state.currentWeekLessons = [];
  clearEntityContent();
  hideContent();
  showState({
    kind: "empty",
    title: "Список пока пуст",
    text: "Не удалось получить список. Запустите npm run scrape, чтобы собрать данные, и обновите страницу.",
    actions: [
      { label: "Повторить", kind: "primary", onClick: () => loadIndex({ fresh: true }) },
      { label: "Открыть сайт ИМСИТ", href: "https://rasp.imsit.ru/", kind: "secondary" }
    ]
  });
  updatePickerNote();
}

function clearEntityContent() {
  state.entity = null;
  state.data = null;
  state.currentWeekLessons = [];
  state.weekStart = null;
  document.title = "Расписание ИМСИТ";
  dom["entity-eyebrow"].textContent = "Расписание";
  dom["entity-title"].textContent = "Расписание ИМСИТ";
  dom["entity-meta"].replaceChildren();
  dom["data-status"].hidden = true;
  dom["entity-input"].value = "";
  dom["entity-clear"].hidden = true;
  hideContent();
}

function showContent() {
  dom["summary-grid"].hidden = false;
  dom["week-section"].hidden = false;
  updateExportState();
}

function hideContent() {
  dom["summary-grid"].hidden = true;
  dom["week-section"].hidden = true;
  dom["upcoming-section"].hidden = true;
}

function showState({ kind = "empty", title, text, actions = [] }) {
  const card = dom["state-card"];
  card.hidden = false;
  dom["state-icon"].className = `state-icon${kind === "error" ? " state-icon--error" : ""}`;
  dom["state-icon"].replaceChildren();

  if (kind === "loading") {
    const spinner = document.createElement("div");
    spinner.className = "spinner";
    dom["state-icon"].append(spinner);
  } else {
    dom["state-icon"].append(stateIcon(kind));
  }

  dom["state-title"].textContent = title || "";
  dom["state-text"].textContent = text || "";

  const box = dom["state-actions"];
  box.replaceChildren();
  for (const action of actions) {
    if (action.href) {
      const link = document.createElement("a");
      link.className = action.kind === "secondary" ? "secondary-button" : "primary-button";
      link.href = action.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = action.label;
      box.append(link);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = action.kind === "secondary" ? "secondary-button" : "primary-button";
    button.textContent = action.label;
    button.addEventListener("click", action.onClick);
    box.append(button);
  }
}

function hideState() {
  dom["state-card"].hidden = true;
  dom["state-actions"].replaceChildren();
}

function stateIcon(kind) {
  const wrapper = document.createElement("div");
  if (kind === "error") {
    wrapper.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 8v5"></path><path d="M12 16.5h.01"></path><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"></path></svg>';
  } else {
    wrapper.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="4"></rect><path d="M8 3v4M16 3v4M3 10h18"></path><path d="M8 14h8M8 17h5"></path></svg>';
  }
  return wrapper.firstElementChild;
}

function sourceUrlFor(entry) {
  const base = state.index?.source || "https://rasp.imsit.ru/";
  try {
    const url = new URL(base);
    url.searchParams.set("page", "schedule");
    url.searchParams.set("mode", MODES[state.mode].searchMode);
    url.searchParams.set(
      "study_form",
      state.mode === "groups"
        ? entry.studyForm || state.forms[0] || "очная"
        : state.forms[0] || "очная"
    );
    url.searchParams.set(MODES[state.mode].field, entry.name);
    url.searchParams.set("show", "1");
    return url.href;
  } catch {
    return base;
  }
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  const next = current === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("rasp-theme", next);
  } catch {
    return;
  }
}

function toast(message) {
  const node = dom["toast"];
  node.textContent = message;
  node.classList.add("is-visible");
  if (state.toastTimer) window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    node.classList.remove("is-visible");
  }, 2600);
}

async function fetchJson(path, { fresh = false } = {}) {
  const target = fresh ? `${path}${path.includes("?") ? "&" : "?"}t=${Date.now()}` : path;
  const response = await fetch(target, {
    cache: fresh ? "no-store" : "default",
    headers: { accept: "application/json" }
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}
