"use strict";

/* Planora frontend — vanilla JavaScript, talks to POST /api/plan */

const $ = (id) => document.getElementById(id);

const form = $("plan-form");
const topicList = $("topic-list");
const deadlineInput = $("deadline");
const dailyInput = $("daily-hours");
const formError = $("form-error");
const generateBtn = $("generate");
const generateLabel = $("generate-label");
const resultsEl = $("results");
const emptyState = $("empty-state");

let topicCounter = 0;
let lastPlan = null;      // last successful API response
let lastRequest = null;   // request that produced it
let dailyTouched = false; // true once the user edits daily hours
let defaultDaily = 3;

/* ---------- Date & time helpers ---------- */

// Today as YYYY-MM-DD in the user's local time zone.
function todayString() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

// Parse "YYYY-MM-DD" as a local date (avoids UTC off-by-one issues).
function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(str, withYear = true) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {})
  }).format(parseDate(str));
}

// 150 -> "2h 30m", 45 -> "45m", 120 -> "2h", 0 -> "0m"
function formatDuration(totalMinutes) {
  const minutes = Math.round(totalMinutes);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/* ---------- Topic rows ---------- */

function addTopic(name = "", hours = "") {
  const id = ++topicCounter;
  const li = document.createElement("li");
  li.className = "topic-row";

  const nameField = document.createElement("div");
  nameField.className = "field";
  const nameLabel = document.createElement("label");
  nameLabel.htmlFor = `topic-name-${id}`;
  nameLabel.textContent = "Topic name";
  const nameInput = document.createElement("input");
  Object.assign(nameInput, { type: "text", id: `topic-name-${id}`, name: "topicName", value: name, placeholder: "e.g. Docker basics", maxLength: 100, autocomplete: "off" });
  nameField.append(nameLabel, nameInput);

  const hoursField = document.createElement("div");
  hoursField.className = "field";
  const hoursLabel = document.createElement("label");
  hoursLabel.htmlFor = `topic-hours-${id}`;
  hoursLabel.textContent = "Hours needed";
  const hoursInput = document.createElement("input");
  Object.assign(hoursInput, { type: "number", id: `topic-hours-${id}`, name: "topicHours", value: hours, min: "0.25", step: "0.25", placeholder: "e.g. 4" });
  hoursInput.inputMode = "decimal";
  hoursField.append(hoursLabel, hoursInput);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn btn-remove";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => {
    li.remove();
    updateRemoveButtons();
    saveState();
  });

  const actions = document.createElement("div");
  actions.className = "topic-actions";
  const makeMover = (symbol, label, dir) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-icon " + (dir < 0 ? "move-up" : "move-down");
    b.textContent = symbol;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", () => {
      const sibling = dir < 0 ? li.previousElementSibling : li.nextElementSibling;
      if (!sibling) return;
      if (dir < 0) topicList.insertBefore(li, sibling);
      else topicList.insertBefore(sibling, li);
      updateRemoveButtons();
      saveState();
      b.focus();
    });
    return b;
  };
  actions.append(makeMover("↑", "Move topic up", -1), makeMover("↓", "Move topic down", 1), removeBtn);
  li.append(nameField, hoursField, actions);
  topicList.append(li);
  updateRemoveButtons();
  return nameInput;
}

// Keep at least one topic row; disable "Remove" when only one is left.
function updateRemoveButtons() {
  const rows = topicList.querySelectorAll(".topic-row");
  rows.forEach((row, i) => {
    row.querySelector(".move-up").disabled = i === 0;
    row.querySelector(".move-down").disabled = i === rows.length - 1;
    const btn = row.querySelector(".btn-remove");
    btn.disabled = rows.length === 1;
    btn.setAttribute("aria-label", `Remove topic ${[...rows].indexOf(row) + 1}`);
  });
}

/* ---------- Validation ---------- */

function clearInvalid() {
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
}

function markInvalid(el) {
  el.setAttribute("aria-invalid", "true");
}

// Mirrors the backend rules in src/scheduler.js. Returns { payload, errors }.
function collectAndValidate() {
  clearInvalid();
  const errors = [];

  const deadline = deadlineInput.value;
  if (!deadline) {
    errors.push("Choose an exam or deadline date.");
    markInvalid(deadlineInput);
  } else if (deadline < todayString()) {
    errors.push("The deadline must be today or a future date.");
    markInvalid(deadlineInput);
  }

  const dailyHours = dailyInput.value.trim() === "" ? NaN : Number(dailyInput.value);
  if (!Number.isFinite(dailyHours) || dailyHours <= 0 || dailyHours > 24) {
    errors.push("Daily study hours must be more than 0 and at most 24.");
    markInvalid(dailyInput);
  } else if (Math.floor(dailyHours * 60) < 1) {
    errors.push("Daily study hours must be at least one minute.");
    markInvalid(dailyInput);
  }

  const topics = [];
  let topicProblem = false;
  topicList.querySelectorAll(".topic-row").forEach((row) => {
    const nameInput = row.querySelector('input[type="text"]');
    const hoursInput = row.querySelector('input[type="number"]');
    const name = nameInput.value.trim();
    const hours = hoursInput.value.trim() === "" ? NaN : Number(hoursInput.value);
    const nameOk = name.length > 0;
    const hoursOk = Number.isFinite(hours) && hours > 0;
    if (!nameOk) markInvalid(nameInput);
    if (!hoursOk) markInvalid(hoursInput);
    if (!nameOk || !hoursOk) topicProblem = true;
    else topics.push({ name, hours });
  });
  if (topicProblem) errors.push("Every topic needs a name and a number of hours greater than 0.");
  if (topicList.children.length === 0) errors.push("Add at least one study topic.");

  return { payload: { topics, deadline, dailyHours }, errors };
}

/* ---------- UI state helpers ---------- */

function showFormError(messages) {
  formError.replaceChildren();
  if (messages.length === 1) {
    formError.textContent = messages[0];
  } else {
    const ul = document.createElement("ul");
    messages.forEach((m) => {
      const li = document.createElement("li");
      li.textContent = m;
      ul.append(li);
    });
    formError.append(ul);
  }
  formError.hidden = false;
}

function hideFormError() {
  formError.hidden = true;
  formError.replaceChildren();
}

function setLoading(isLoading) {
  generateBtn.disabled = isLoading;
  generateBtn.classList.toggle("is-loading", isLoading);
  generateBtn.setAttribute("aria-busy", String(isLoading));
  generateLabel.textContent = isLoading ? "Generating…" : "Generate Study Plan";
}

/* ---------- API call ---------- */

async function requestPlan(payload) {
  let response;
  try {
    response = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    throw new Error("Could not reach the Planora server. Check that it is running and try again.");
  }

  let body = null;
  try {
    body = await response.json();
  } catch (err) {
    /* body is not JSON; handled below */
  }

  if (!response.ok) {
    const detail = body && typeof body.error === "string" ? body.error : `The server responded with status ${response.status}.`;
    throw new Error(detail);
  }
  if (!body || !Array.isArray(body.days) || typeof body.unscheduledMinutes !== "number" || typeof body.feasible !== "boolean") {
    throw new Error("The server returned an unexpected response. Please try again.");
  }
  return body;
}

/* ---------- Rendering ---------- */

function renderPlan(plan, request) {
  const unscheduled = plan.unscheduledMinutes;
  const scheduled = plan.days.reduce(
    (sum, day) => sum + day.sessions.reduce((s, session) => s + session.minutes, 0), 0);
  const total = scheduled + unscheduled;

  // Status banner
  const status = $("status");
  status.className = "alert " + (plan.feasible ? "alert-ok" : "alert-warn");
  renderStatus(plan, unscheduled, total);

  // Summary
  $("sum-total").textContent = formatDuration(total);
  $("sum-scheduled").textContent = formatDuration(scheduled);
  $("sum-unscheduled").textContent = formatDuration(unscheduled);
  $("sum-feasible").textContent = plan.feasible ? "On track" : "Not feasible";
  $("sum-feasible").parentElement.className = "stat " + (plan.feasible ? "ok" : "warn");
  $("sum-unscheduled").parentElement.classList.toggle("warn", unscheduled > 0);

  initCalendar(plan, request);

  emptyState.hidden = true;
  resultsEl.hidden = false;
}

/* ---------- Calendar with drag & drop ---------- */

let calendar = new Map();  // "YYYY-MM-DD" -> [{ topic, minutes }]
let rangeDates = [];       // every date from today to the deadline, in order
let dailyLimitMinutes = 0;
let modified = false;      // true once the user has moved something
let dragging = null;       // { from, index } while a session is being dragged

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function initCalendar(plan, request) {
  rangeDates = plan.days.map((d) => d.date);
  calendar = new Map(plan.days.map((d) => [d.date, d.sessions.map((s) => ({ topic: s.topic, minutes: s.minutes, done: false }))]));
  dailyLimitMinutes = Math.floor(request.dailyHours * 60);
  modified = false;
  renderCalendar();
}

function announce(message) {
  $("cal-live").textContent = message;
}

// Deadline and available days are shown separately; study days follow the moves.
function updateMeta() {
  const studyDays = [...calendar.values()].filter((sessions) => sessions.length > 0).length;
  $("schedule-meta").textContent =
    `Deadline: ${formatDate(lastRequest.deadline)} · Days available: ${rangeDates.length} · Days with study sessions: ${studyDays}`;
}

// Moves one session to another day. Same-topic sessions on a day are merged.
// Returns the session's index on the target day.
function moveSession(from, index, to) {
  const [session] = calendar.get(from).splice(index, 1);
  const target = calendar.get(to);
  let newIndex = target.findIndex((s) => s.topic === session.topic);
  if (newIndex >= 0) {
    target[newIndex].minutes += session.minutes;
    target[newIndex].done = Boolean(target[newIndex].done && session.done);
  }
  else newIndex = target.push(session) - 1;
  modified = true;
  renderCalendar();
  announce(`Moved ${session.topic} (${formatDuration(session.minutes)}) to ${formatDate(to)}.`);
  return newIndex;
}

function renderCalendar() {
  const container = $("schedule");
  container.replaceChildren();
  updateMeta();

  // Group dates by month
  const months = new Map();
  rangeDates.forEach((date) => {
    const key = date.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(date);
  });

  months.forEach((dates) => {
    const section = document.createElement("section");
    section.className = "cal-month";

    const title = document.createElement("h4");
    title.className = "cal-title";
    title.textContent = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(parseDate(dates[0]));

    const weekdays = document.createElement("div");
    weekdays.className = "cal-weekdays";
    weekdays.setAttribute("aria-hidden", "true");
    WEEKDAYS.forEach((name) => {
      const span = document.createElement("span");
      span.textContent = name;
      weekdays.append(span);
    });

    const grid = document.createElement("div");
    grid.className = "cal-grid";
    const offset = (parseDate(dates[0]).getDay() + 6) % 7; // Monday-first
    for (let i = 0; i < offset; i++) {
      const blank = document.createElement("div");
      blank.className = "cal-blank";
      blank.setAttribute("aria-hidden", "true");
      grid.append(blank);
    }
    dates.forEach((date) => grid.append(buildCell(date)));

    section.append(title, weekdays, grid);
    container.append(section);
  });
  updateProgress();
  renderToday();
  renderOverdue();
  saveState();
}

function buildCell(date) {
  const sessions = calendar.get(date);
  const total = sessions.reduce((sum, s) => sum + s.minutes, 0);
  const isOver = total > dailyLimitMinutes;

  const cell = document.createElement("div");
  cell.className = "cal-cell";
  cell.dataset.date = date;
  cell.setAttribute("role", "group");
  cell.setAttribute("aria-label", formatDate(date));
  if (sessions.length === 0) cell.classList.add("is-empty");
  if (isOver) cell.classList.add("is-over");
  if (date === lastRequest.deadline) cell.classList.add("is-deadline");
  if (date === todayString()) cell.classList.add("is-today");
  if (date < todayString()) cell.classList.add("is-past");

  // Header: day number, weekday (phones only), total
  const head = document.createElement("div");
  head.className = "cal-head";
  const day = document.createElement("span");
  day.className = "cal-day";
  day.textContent = String(parseDate(date).getDate());
  const wd = document.createElement("span");
  wd.className = "cal-wd";
  wd.textContent = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short" }).format(parseDate(date));
  day.append(wd);
  head.append(day);
  if (total > 0) {
    const badge = document.createElement("span");
    badge.className = "day-total";
    badge.textContent = formatDuration(total);
    head.append(badge);
  }
  cell.append(head);

  if (date === todayString()) cell.append(makeNote("Today", false));
  if (date === lastRequest.deadline) cell.append(makeNote("Deadline", false));
  if (isOver) cell.append(makeNote("Over daily limit", true));

  // Sessions
  if (sessions.length > 0) {
    const ul = document.createElement("ul");
    ul.className = "session-list";
    sessions.forEach((s, index) => ul.append(buildSession(date, s, index)));
    cell.append(ul);
  }

  // Drop target
  cell.addEventListener("dragover", (e) => {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    cell.classList.add("drag-over");
  });
  cell.addEventListener("dragleave", (e) => {
    if (!cell.contains(e.relatedTarget)) cell.classList.remove("drag-over");
  });
  cell.addEventListener("drop", (e) => {
    if (!dragging) return;
    e.preventDefault();
    const { from, index } = dragging;
    dragging = null;
    if (from !== date) moveSession(from, index, date);
    else cell.classList.remove("drag-over");
  });

  return cell;
}

function makeNote(text, isWarning) {
  const note = document.createElement("span");
  note.className = "cal-note" + (isWarning ? " over" : "");
  note.textContent = text;
  return note;
}

function buildSession(date, session, index) {
  const li = document.createElement("li");
  li.className = "session";
  li.draggable = true;

  const topic = document.createElement("span");
  topic.className = "session-topic";
  topic.textContent = session.topic; // textContent: safe for user-entered text
  const time = document.createElement("span");
  time.className = "session-time";
  time.textContent = formatDuration(session.minutes);

  li.addEventListener("dragstart", (e) => {
    dragging = { from: date, index };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", session.topic); // required by Firefox
    li.classList.add("dragging");
  });
  li.addEventListener("dragend", () => {
    dragging = null;
    li.classList.remove("dragging");
    document.querySelectorAll(".cal-cell.drag-over").forEach((c) => c.classList.remove("drag-over"));
  });

  // Button alternative to dragging (keyboard and touch friendly)
  const pos = rangeDates.indexOf(date);
  const controls = document.createElement("div");
  controls.className = "session-move no-print";
  controls.append(
    makeMoveButton("‹", `Move ${session.topic} to the previous day`, pos > 0, () => rangeDates[pos - 1], date, index, "prev"),
    makeMoveButton("›", `Move ${session.topic} to the next day`, pos < rangeDates.length - 1, () => rangeDates[pos + 1], date, index, "next")
  );

  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = Boolean(session.done);
  check.setAttribute("aria-label", `Mark ${session.topic} as done`);
  li.classList.toggle("done", check.checked);
  li.style.borderLeft = `4px solid ${topicColor(session.topic)}`;
  check.addEventListener("change", () => {
    session.done = check.checked;
    li.classList.toggle("done", check.checked);
    updateProgress();
    renderToday();
    saveState();
  });
  const row = document.createElement("div");
  row.className = "session-row";
  row.append(check, topic);

  li.append(row, time, controls);
  return li;
}

function makeMoveButton(symbol, label, enabled, getTarget, from, index, which) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = symbol;
  btn.setAttribute("aria-label", label);
  btn.disabled = !enabled;
  btn.addEventListener("click", () => {
    const to = getTarget();
    const newIndex = moveSession(from, index, to);
    // Put keyboard focus back on the moved session
    const moved = document.querySelector(`.cal-cell[data-date="${to}"]`)?.querySelectorAll(".session")[newIndex];
    const next = moved?.querySelector(`.session-move button:nth-child(${which === "prev" ? 1 : 2})`);
    (next && !next.disabled ? next : moved?.querySelector(".session-move button:not(:disabled)"))?.focus();
  });
  return btn;
}

/* ---------- Extras: status tip, colours, progress, calendar export, saving ---------- */

const PALETTE = ["#3b6ef5", "#7c4dff", "#0f9d8a", "#e0791a", "#d6336c", "#2f9e44", "#1c7ed6", "#9c36b5"];
const STORE_KEY = "planora.v1";

function toDateString(d) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function topicColor(name) {
  const names = [...new Set(lastRequest.topics.map((t) => t.name))];
  return PALETTE[Math.max(0, names.indexOf(name)) % PALETTE.length];
}

function updateDaysLeft() {
  const el = $("days-left");
  if (!deadlineInput.value || deadlineInput.value < todayString()) { el.textContent = ""; return; }
  const days = Math.round((parseDate(deadlineInput.value) - parseDate(todayString())) / 86400000) + 1;
  el.textContent = `${days} day${days === 1 ? "" : "s"} available, including today`;
}

// Warning banner; when time is short, suggest the daily hours that would fit everything.
function renderStatus(plan, unscheduled, total) {
  const status = $("status");
  status.replaceChildren();
  if (plan.feasible) {
    status.textContent = "Great news — all topics fit before your deadline.";
    return;
  }
  const msg = document.createElement("span");
  msg.textContent = `Not everything fits. ${formatDuration(unscheduled)} of study time cannot be scheduled before the deadline. `;
  status.append(msg);

  const needed = Math.ceil(total / plan.days.length / 15) * 15; // minutes per day, rounded up to 15
  if (needed > 24 * 60) {
    msg.append("Even 24 hours a day is not enough. Choose a later deadline or remove some topics.");
    return;
  }
  msg.append(`Studying ${formatDuration(needed)} per day would fit everything.`);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-secondary no-print";
  btn.textContent = "Apply and regenerate";
  btn.addEventListener("click", () => {
    dailyInput.value = needed / 60;
    dailyTouched = true;
    form.requestSubmit();
  });
  status.append(btn);
}

function updateProgress() {
  const stats = new Map(); // topic -> { done, total } in minutes
  calendar.forEach((sessions) => sessions.forEach((s) => {
    const t = stats.get(s.topic) || { done: 0, total: 0 };
    t.total += s.minutes;
    if (s.done) t.done += s.minutes;
    stats.set(s.topic, t);
  }));
  let done = 0, total = 0;
  stats.forEach((t) => { done += t.done; total += t.total; });
  const pct = total ? Math.round((done / total) * 100) : 0;
  $("progress-text").textContent = `${formatDuration(done)} of ${formatDuration(total)} done (${pct}%)`;
  $("progress-bar").value = pct;

  const legend = $("legend");
  legend.replaceChildren();
  stats.forEach((t, name) => {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = topicColor(name);
    li.append(swatch, `${name}: ${formatDuration(t.done)} / ${formatDuration(t.total)}`);
    legend.append(li);
  });
}

// Save form, plan, moves and checkmarks in this browser so a refresh loses nothing.
function saveState() {
  try {
    const topics = [...topicList.querySelectorAll(".topic-row")].map((row) => ({
      name: row.querySelector('input[type="text"]').value,
      hours: row.querySelector('input[type="number"]').value
    }));
    localStorage.setItem(STORE_KEY, JSON.stringify({
      form: { deadline: deadlineInput.value, dailyHours: dailyInput.value, topics },
      request: lastRequest,
      original: lastPlan,
      current: lastPlan ? rangeDates.map((d) => [d, calendar.get(d)]) : null,
      modified
    }));
  } catch (err) { /* storage unavailable or full: the app still works */ }
}

function clearSaved() {
  try { localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
}

function loadState() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (err) { return; }
  if (!saved || !saved.form) return;
  try {
    topicList.replaceChildren();
    (saved.form.topics || []).forEach((t) => addTopic(t.name, t.hours));
    if (topicList.children.length === 0) addTopic();
    deadlineInput.value = saved.form.deadline || "";
    if (saved.form.dailyHours) { dailyInput.value = saved.form.dailyHours; dailyTouched = true; }
    if (saved.original && saved.request && saved.current) {
      lastPlan = saved.original;
      lastRequest = saved.request;
      renderPlan(lastPlan, lastRequest);
      calendar = new Map(saved.current); // restore moved sessions and checkmarks
      modified = Boolean(saved.modified);
      renderCalendar();
    }
  } catch (err) { clearSaved(); }
}

/* ---------- Today card, catch-up and focus timer ---------- */

function renderToday() {
  const list = $("today-list");
  list.replaceChildren();
  const today = todayString();
  const sessions = calendar.get(today);
  if (!sessions || sessions.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = sessions
      ? "Nothing planned for today. Drag a session here if you want to get ahead."
      : "Today is outside your plan's date range.";
    list.append(li);
    return;
  }
  sessions.forEach((s, index) => {
    const li = document.createElement("li");
    li.className = "today-item" + (s.done ? " done" : "");
    li.style.borderLeftColor = topicColor(s.topic);
    const label = document.createElement("label");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = Boolean(s.done);
    const name = document.createElement("span");
    name.className = "t-name";
    name.textContent = s.topic;
    label.append(check, name);
    const time = document.createElement("span");
    time.className = "t-time";
    time.textContent = formatDuration(s.minutes);
    check.addEventListener("change", () => {
      s.done = check.checked;
      li.classList.toggle("done", s.done);
      // keep the matching calendar session in sync without a full re-render
      const mirror = document.querySelectorAll(`.cal-cell[data-date="${today}"] .session`)[index];
      if (mirror) {
        mirror.classList.toggle("done", s.done);
        mirror.querySelector('input[type="checkbox"]').checked = s.done;
      }
      updateProgress();
      saveState();
    });
    li.append(label, time);
    list.append(li);
  });
}

// Unfinished sessions from past days can be pulled into today with one click.
function renderOverdue() {
  const box = $("overdue");
  const today = todayString();
  let minutes = 0;
  rangeDates.forEach((d) => {
    if (d < today) calendar.get(d).forEach((s) => { if (!s.done) minutes += s.minutes; });
  });
  if (minutes === 0 || !rangeDates.includes(today)) { box.hidden = true; return; }

  box.replaceChildren(`You have ${formatDuration(minutes)} of unfinished study from earlier days. `);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-secondary";
  btn.textContent = "Move to today";
  btn.addEventListener("click", () => {
    const target = calendar.get(today);
    rangeDates.filter((d) => d < today).forEach((d) => {
      const keep = [];
      calendar.get(d).forEach((s) => {
        if (s.done) { keep.push(s); return; }
        const hit = target.find((t) => t.topic === s.topic);
        if (hit) { hit.minutes += s.minutes; hit.done = false; } else target.push(s);
      });
      calendar.set(d, keep);
    });
    modified = true;
    renderCalendar();
    announce(`Moved ${formatDuration(minutes)} of unfinished study to today.`);
  });
  box.append(btn);
  box.hidden = false;
}

let timerEnd = null;   // timestamp when the running timer finishes, null when stopped
let timerLeft = 25 * 60;
let timerId = null;

function drawTimer() {
  const text = `${Math.floor(timerLeft / 60)}:${String(timerLeft % 60).padStart(2, "0")}`;
  $("timer-display").textContent = text;
  document.title = timerEnd ? `${text} · Planora` : "Planora — Smart Study Planner";
}

function stopTimer() {
  clearInterval(timerId);
  timerId = timerEnd = null;
  $("timer-toggle").textContent = "Start focus";
}

function tick() {
  timerLeft = Math.max(0, Math.round((timerEnd - Date.now()) / 1000));
  if (timerLeft === 0) {
    stopTimer();
    announce("Focus session finished. Time for a short break.");
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (err) { /* sound is optional */ }
  }
  drawTimer();
}

function toggleTimer() {
  if (timerEnd) { // pause
    const left = timerLeft;
    stopTimer();
    timerLeft = left;
    $("timer-toggle").textContent = "Resume";
    drawTimer();
    return;
  }
  if (timerLeft <= 0) timerLeft = Number($("timer-length").value) * 60;
  timerEnd = Date.now() + timerLeft * 1000;
  timerId = setInterval(tick, 500);
  $("timer-toggle").textContent = "Pause";
  drawTimer();
}

function resetTimer() {
  stopTimer();
  timerLeft = Number($("timer-length").value) * 60;
  drawTimer();
}

/* ---------- Events ---------- */

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideFormError();

  const { payload, errors } = collectAndValidate();
  if (errors.length > 0) {
    showFormError(errors);
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  setLoading(true);
  try {
    const plan = await requestPlan(payload);
    lastPlan = plan;
    lastRequest = payload;
    renderPlan(plan, payload);
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showFormError([err.message]);
  } finally {
    setLoading(false);
  }
});

$("add-topic").addEventListener("click", () => { addTopic().focus(); saveState(); });

$("reset-form").addEventListener("click", () => {
  form.reset();
  clearInvalid();
  hideFormError();
  topicList.replaceChildren();
  addTopic();
  dailyInput.value = defaultDaily;
  dailyTouched = false;
  lastPlan = lastRequest = null;
  clearSaved();
  updateDaysLeft();
  resultsEl.hidden = true;
  emptyState.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("print").addEventListener("click", () => window.print());
dailyInput.addEventListener("input", () => { dailyTouched = true; });

/* ---------- Init ---------- */

deadlineInput.min = todayString();
addTopic();
loadState();
updateDaysLeft();
form.addEventListener("input", saveState);
deadlineInput.addEventListener("input", updateDaysLeft);
$("timer-toggle").addEventListener("click", toggleTimer);
$("timer-reset").addEventListener("click", resetTimer);
$("timer-length").addEventListener("change", () => { if (!timerEnd) resetTimer(); });
document.querySelectorAll("[data-add-days]").forEach((btn) => btn.addEventListener("click", () => {
  const d = parseDate(todayString());
  const n = Number(btn.dataset.addDays);
  if (n === 30) d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + n);
  deadlineInput.value = toDateString(d);
  updateDaysLeft();
  saveState();
}));

// Optional: use the backend's suggested default for daily hours.
fetch("/api/config")
  .then((r) => (r.ok ? r.json() : null))
  .then((cfg) => {
    if (cfg && Number.isFinite(cfg.defaultDailyHours) && cfg.defaultDailyHours > 0) {
      defaultDaily = cfg.defaultDailyHours;
      if (!dailyTouched) dailyInput.value = defaultDaily;
    }
  })
  .catch(() => { /* non-critical: the form keeps its built-in default of 3 */ });