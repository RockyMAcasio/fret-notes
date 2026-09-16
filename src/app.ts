type Progress = 'Learning' | 'Practicing' | 'Comfortable';
type Category = 'Songs' | 'Scales' | 'Technique' | 'Theory' | 'Miscellaneous';
type StoredCategory = Category | 'Uncategorized';
type Session = { id: string; song: string; category: StoredCategory; minutes: number; date: string; progress: Progress; notes: string; createdAt: number };
type SessionInput = Omit<Session, 'id' | 'createdAt'>;
const STORAGE_KEY = 'fret-notes.sessions.v1';
const GOALS_KEY = 'fret-notes.weekly-goals.v1';
type WeeklyGoal = { week: string; minutes: number | null; days: number | null };
let goals: WeeklyGoal[] = [];
let goalsLoaded = true;
let recapOffset = 0;
const progressLabels: Record<Progress, string> = { Learning: 'Starting', Practicing: 'Getting smoother', Comfortable: 'Playing comfortably' };
const categoryLabels: Record<StoredCategory, string> = { Songs: 'Songs', Scales: 'Scales', Technique: 'Technique / accuracy', Theory: 'Fretboard / theory knowledge', Miscellaneous: 'Miscellaneous', Uncategorized: 'Uncategorized' };
const categories: Category[] = ['Scales', 'Songs', 'Technique', 'Theory', 'Miscellaneous'];
const nameFields: Record<Category, { label: string; placeholder: string }> = {
  Songs: { label: 'Song name', placeholder: 'e.g. Blackbird — The Beatles' },
  Scales: { label: 'Scale name', placeholder: 'e.g. A minor pentatonic, position 1' },
  Technique: { label: 'Technique or accuracy exercise', placeholder: 'e.g. Alternate picking at 80 BPM' },
  Theory: { label: 'Fretboard or theory topic', placeholder: 'e.g. Finding notes on the low E string' },
  Miscellaneous: { label: 'What did you practice?', placeholder: 'e.g. Ear training or improvisation' }
};
const get = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const form = get<HTMLFormElement>('session-form');
const categoryInput = get<HTMLSelectElement>('category');
const songInput = get<HTMLInputElement>('song');
const historyCategory = get<HTMLSelectElement>('history-category');
const historySearch = get<HTMLInputElement>('history-search');
const dateInput = get<HTMLInputElement>('date');
const minutesInput = get<HTMLInputElement>('minutes');
const progressInput = get<HTMLSelectElement>('progress');
const notesInput = get<HTMLTextAreaElement>('notes');
function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00');
  return !Number.isNaN(date.getTime()) && localDate(date) === value && value <= localDate(new Date()) && value >= '1900-01-01';
}
// Calendar-day arithmetic avoids 23/25-hour daylight-saving days.
function moveDay(key: string, offset: number): string {
  const date = new Date(key + 'T12:00:00');
  date.setDate(date.getDate() + offset);
  return localDate(date);
}
function weekStart(key: string): string {
  const date = new Date(key + 'T12:00:00');
  return moveDay(key, -((date.getDay() + 6) % 7));
}
function currentStreak(records: Session[], today: string): number {
  const days = new Set(records.map(session => session.date));
  let cursor = days.has(today) ? today : moveDay(today, -1);
  let count = 0;
  while (days.has(cursor)) { count++; cursor = moveDay(cursor, -1); }
  return count;
}
function weekSummary(records: Session[], start: string) {
  const end = moveDay(start, 6);
  const entries = records.filter(session => session.date >= start && session.date <= end)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const categoryMinutes = new Map<StoredCategory, number>();
  const activities = new Map<string, { latest: Session; minutes: number; count: number }>();
  entries.forEach(session => {
    categoryMinutes.set(session.category, (categoryMinutes.get(session.category) ?? 0) + session.minutes);
    const key = `${session.category}:${session.song.toLocaleLowerCase()}`;
    const item = activities.get(key);
    if (item) { item.minutes += session.minutes; item.count++; }
    else activities.set(key, { latest: session, minutes: session.minutes, count: 1 });
  });
  return { entries, categoryMinutes, activities, minutes: entries.reduce((sum, entry) => sum + entry.minutes, 0), days: new Set(entries.map(entry => entry.date)).size };
}
function validateGoal(value: unknown): WeeklyGoal {
  if (!value || typeof value !== 'object') throw new Error('Enter a valid weekly goal.');
  const goal = value as WeeklyGoal;
  if (!validDate(goal.week) || weekStart(goal.week) !== goal.week) throw new Error('Invalid goal week.');
  if (goal.minutes !== null && (!Number.isInteger(goal.minutes) || goal.minutes < 1 || goal.minutes > 10080)) throw new Error('Choose 1–10,080 minutes per week, or leave it blank.');
  if (goal.days !== null && (!Number.isInteger(goal.days) || goal.days < 1 || goal.days > 7)) throw new Error('Choose 1–7 practice days per week, or leave it blank.');
  return { week: goal.week, minutes: goal.minutes, days: goal.days };
}
function goalForWeek(week: string): WeeklyGoal | undefined {
  return [...goals].filter(goal => goal.week <= week).sort((a, b) => b.week.localeCompare(a.week))[0];
}
try {
  const stored = localStorage.getItem(GOALS_KEY);
  if (stored) {
    const data: unknown = JSON.parse(stored);
    if (!Array.isArray(data)) throw new Error('Invalid saved goals.');
    goals = data.map(validateGoal);
  }
} catch {
  goalsLoaded = false;
  get('goal-message').textContent = 'Saved goals could not be loaded. Reload or check browser storage before changing them.';
  get<HTMLFormElement>('goal-form').querySelector('button')!.disabled = true;
  get<HTMLButtonElement>('clear-goals').disabled = true;
}
function saveGoals(minutes: number | null, days: number | null): void {
  if (!goalsLoaded) throw new Error('Saved goals could not be loaded. Reload before changing them.');
  const goal = validateGoal({ week: weekStart(localDate(new Date())), minutes, days });
  const nextGoals = [...goals.filter(item => item.week !== goal.week), goal];
  try { localStorage.setItem(GOALS_KEY, JSON.stringify(nextGoals)); }
  catch { throw new Error('Your goals could not be saved. Check browser storage and try again.'); }
  goals = nextGoals;
  renderMomentum();
  get('goal-message').textContent = minutes === null && days === null ? 'Goals cleared from this week onward.' : 'Weekly goals saved.';
}
function fillGoalInputs(): void {
  const goal = goalForWeek(weekStart(localDate(new Date())));
  get<HTMLInputElement>('goal-minutes').value = goal?.minutes == null ? '' : String(goal.minutes);
  get<HTMLInputElement>('goal-days').value = goal?.days == null ? '' : String(goal.days);
}
function validateInput(input: unknown, allowUncategorized = false): SessionInput {
  if (!input || typeof input !== 'object') throw new Error('Please enter a session.');
  const data = input as Record<string, unknown>;
  if (!categories.includes(data.category as Category) && !(allowUncategorized && data.category === 'Uncategorized')) throw new Error('Choose what you worked on.');
  if (typeof data.song !== 'string' || !data.song.trim() || data.song.trim().length > 100) throw new Error('Enter a practice name or topic (up to 100 characters).');
  if (typeof data.minutes !== 'number' || !Number.isInteger(data.minutes) || data.minutes < 1 || data.minutes > 1440) throw new Error('Practice time must be a whole number from 1 to 1,440 minutes.');
  if (!validDate(data.date)) throw new Error('Choose a valid practice date, today or earlier.');
  if (!['Learning', 'Practicing', 'Comfortable'].includes(data.progress as string)) throw new Error('Choose a progress level.');
  if (typeof data.notes !== 'string' || data.notes.length > 1000) throw new Error('Keep your notes under 1,000 characters.');
  return { song: data.song.trim(), category: data.category as StoredCategory, minutes: data.minutes, date: data.date, progress: data.progress as Progress, notes: data.notes.trim() };
}
function setMessage(message: string): void { get('message').textContent = message; }
let sessions: Session[] = [];
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const data: unknown = JSON.parse(stored);
    if (!Array.isArray(data)) throw new Error('Invalid saved data');
    sessions = data.map((item: Session) => {
      // Older logs combined songs and exercises; do not guess their category.
      const session = validateInput({ ...item, category: item.category ?? 'Uncategorized' }, true);
      if (typeof item.id !== 'string' || !item.id || typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt)) throw new Error('Invalid saved session');
      return { ...session, id: item.id, createdAt: item.createdAt };
    });
  }
} catch {
  setMessage('Saved sessions could not be loaded. Reload or check browser storage before adding new sessions.');
  form.querySelector('button')!.disabled = true;
}
function persist(nextSessions: Session[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSessions)); }
  catch { throw new Error('This browser could not save your session. Check storage settings and try again.'); }
  sessions = nextSessions;
  render();
}
function createSession(input: unknown): Session {
  if (form.querySelector('button')!.disabled) throw new Error('Saved sessions could not be loaded. Reload before adding sessions.');
  const session: Session = { ...validateInput(input), id: crypto.randomUUID(), createdAt: Date.now() };
  persist([...sessions, session]);
  setMessage(`Saved ${session.minutes} minutes of ${session.song}. Nice work.`);
  return session;
}
function updateCategory(id: string, category: unknown): void {
  if (!categories.includes(category as Category)) throw new Error('Choose a valid practice category.');
  const session = sessions.find(item => item.id === id);
  if (!session) throw new Error('This session could not be found.');
  persist(sessions.map(item => item.id === id ? { ...item, category: category as Category } : item));
  setMessage(`Updated the category for ${session.song}.`);
}
function updateNameField(): void {
  const selected = categories.includes(categoryInput.value as Category);
  const config = selected ? nameFields[categoryInput.value as Category] : { label: 'Practice name or topic', placeholder: 'Choose a category first' };
  get('practice-name-label').textContent = config.label;
  songInput.placeholder = config.placeholder;
  songInput.disabled = !selected;
}
function element(tag: string, className: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function emptyState(title: string, description: string): HTMLElement {
  const box = element('div', 'empty-state');
  box.append(element('strong', '', title), element('p', '', description));
  return box;
}
function setTime(id: string, minutes: number): void {
  const el = get(id);
  el.replaceChildren(document.createTextNode(minutes.toLocaleString()), element('span', '', ' min'));
}
function render(): void {
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - 6 + index);
    const key = localDate(date);
    return { date, key, minutes: sessions.filter(session => session.date === key).reduce((sum, session) => sum + session.minutes, 0) };
  });
  const songs = new Map<string, { latest: Session; total: number; count: number }>();
  sorted.forEach(session => {
    const key = `${session.category}:${session.song.toLocaleLowerCase()}`;
    const song = songs.get(key);
    if (song) { song.total += session.minutes; song.count += 1; }
    else songs.set(key, { latest: session, total: session.minutes, count: 1 });
  });
  setTime('total-time', sessions.reduce((sum, session) => sum + session.minutes, 0));
  setTime('week-time', days.reduce((sum, day) => sum + day.minutes, 0));
  get('total-sessions').textContent = sessions.length.toLocaleString();
  get('total-songs').textContent = songs.size.toLocaleString();
  get('song-count').textContent = `${songs.size} ${songs.size === 1 ? 'item' : 'items'}`;
  const chart = get('week-chart'); chart.replaceChildren();
  const max = Math.max(30, ...days.map(day => day.minutes));
  days.forEach(day => {
    const col = element('div', 'chart-column');
    col.setAttribute('aria-label', `${day.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${day.minutes} minutes`);
    const track = element('div', 'bar-track');
    const fill = element('div', 'bar-fill'); fill.style.height = `${Math.max(day.minutes ? 5 : 0, day.minutes / max * 100)}%`;
    track.append(fill, element('span', `bar-value${day.minutes ? ' has-minutes' : ''}`, String(day.minutes)));
    col.append(track, element('span', 'chart-day', day.date.toLocaleDateString(undefined, { weekday: 'short' })));
    chart.append(col);
  });
  const repertoire = get('repertoire'); repertoire.replaceChildren();
  if (!songs.size) repertoire.append(emptyState('Start building your practice collection.', 'Log a song, scale, technique, or theory topic to track your progress.'));
  songs.forEach(({ latest, total, count }) => {
    const card = element('div', `song-card ${latest.progress}`);
    const body = element('div', 'song-body');
    body.append(element('div', 'song-category', categoryLabels[latest.category]), element('div', 'song-name', latest.song), element('div', 'song-meta', `${total.toLocaleString()} min · ${count} ${count === 1 ? 'session' : 'sessions'}`));
    card.append(element('span', 'song-initial', latest.song.charAt(0).toUpperCase()), body, element('span', `status ${latest.progress}`, progressLabels[latest.progress]));
    repertoire.append(card);
  });
  renderHistory(sorted);
  renderMomentum();
}
function renderMomentum(): void {
  const today = localDate(new Date());
  const start = weekStart(today);
  const summary = weekSummary(sessions, start);
  const goal = goalForWeek(start);
  const goalProgress = get('goal-progress'); goalProgress.replaceChildren();
  const addGoalProgress = (label: string, actual: number, target: number, unit: string): void => {
    const row = element('div', 'goal-progress-item');
    const heading = element('div', 'goal-progress-label');
    heading.append(element('strong', '', label), element('span', '', `${actual} / ${target} ${unit}`));
    const progress = element('progress', '') as HTMLProgressElement;
    progress.max = target; progress.value = Math.min(actual, target);
    progress.setAttribute('aria-label', `${label}: ${actual} of ${target} ${unit}`);
    row.append(heading, progress, element('p', 'goal-progress-caption', actual >= target ? 'Goal reached for this week!' : `${target - actual} ${unit} to go this week.`));
    goalProgress.append(row);
  };
  if (goal?.minutes) addGoalProgress('Practice time', summary.minutes, goal.minutes, 'min');
  if (goal?.days) addGoalProgress('Practice days', summary.days, goal.days, 'days');
  if (goalsLoaded && !goal?.minutes && !goal?.days) goalProgress.append(element('p', 'panel-hint', 'Set a goal above to see your progress here.'));
  const streak = currentStreak(sessions, today);
  const practicedToday = sessions.some(session => session.date === today);
  get('streak-count').textContent = String(streak);
  get('streak-unit').textContent = streak === 1 ? 'day in a row' : 'days in a row';
  get('streak-message').textContent = practicedToday ? 'You practiced today. Keep the rhythm going.' : streak > 0 ? 'Practice today to keep your streak going.' : 'Log a session today to start a new streak.';
  const strip = get('streak-days'); strip.replaceChildren();
  const practicedDays = new Set(sessions.map(session => session.date));
  for (let index = 0; index < 7; index++) {
    const key = moveDay(start, index);
    const practiced = practicedDays.has(key);
    const date = new Date(key + 'T12:00:00');
    const day = element('div', `streak-day${practiced ? ' practiced' : ''}${key === today ? ' today' : ''}`);
    day.setAttribute('aria-label', `${date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${practiced ? 'practiced' : key > today ? 'upcoming' : 'no practice logged'}`);
    day.append(element('span', 'streak-day-mark', practiced ? '✓' : '–'), element('span', '', date.toLocaleDateString(undefined, { weekday: 'short' })));
    strip.append(day);
  }
  renderRecap();
}
function renderRecap(): void {
  const thisWeek = weekStart(localDate(new Date()));
  const earliestWeek = [...sessions.map(session => weekStart(session.date)), ...goals.map(goal => goal.week), thisWeek].sort()[0];
  let start = moveDay(thisWeek, recapOffset * 7);
  if (start < earliestWeek) { start = earliestWeek; recapOffset = Math.round((Date.parse(start + 'T12:00:00Z') - Date.parse(thisWeek + 'T12:00:00Z')) / 604800000); }
  const end = moveDay(start, 6);
  const summary = weekSummary(sessions, start);
  get<HTMLButtonElement>('previous-week').disabled = start <= earliestWeek;
  get<HTMLButtonElement>('next-week').disabled = recapOffset >= 0;
  get<HTMLButtonElement>('this-week').disabled = recapOffset === 0;
  const formatDate = (key: string) => new Date(key + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  get('recap-range').textContent = `${formatDate(start)} – ${formatDate(end)}${recapOffset === 0 ? ' · This week so far' : ''}`;
  const totals = get('recap-summary'); totals.replaceChildren();
  [[summary.minutes, 'minutes practiced'], [summary.days, 'practice days'], [summary.entries.length, 'sessions logged']].forEach(([value, label]) => {
    const metric = element('div', 'recap-metric');
    metric.append(element('strong', '', String(value)), element('span', '', String(label))); totals.append(metric);
  });
  const goal = goalForWeek(start);
  const goalParts: string[] = [];
  if (goal?.minutes) goalParts.push(`${summary.minutes}/${goal.minutes} min${summary.minutes >= goal.minutes ? ' — reached' : ''}`);
  if (goal?.days) goalParts.push(`${summary.days}/${goal.days} days${summary.days >= goal.days ? ' — reached' : ''}`);
  get('recap-goals').textContent = goalParts.length ? `Weekly goals: ${goalParts.join(' · ')}` : 'No goals set for this week.';
  const categories = get('recap-categories'); categories.replaceChildren();
  [...summary.categoryMinutes.entries()].sort((a, b) => b[1] - a[1]).forEach(([category, minutes]) => {
    const row = element('div', 'category-summary-row');
    const label = element('div', 'category-summary-label');
    label.append(element('span', '', categoryLabels[category]), element('span', '', `${minutes} min`));
    const track = element('div', 'category-summary-track'); track.setAttribute('aria-hidden', 'true');
    const fill = element('div', 'category-summary-fill'); fill.style.width = `${minutes / summary.minutes * 100}%`; track.append(fill);
    row.append(label, track); categories.append(row);
  });
  const activities = get('recap-activities'); activities.replaceChildren();
  [...summary.activities.values()].sort((a, b) => b.minutes - a.minutes).forEach(({ latest, minutes, count }) => {
    const activity = element('div', 'recap-activity');
    activity.append(element('div', 'recap-activity-title', latest.song), element('p', 'recap-activity-meta', `${categoryLabels[latest.category]} · ${minutes} min · ${count} ${count === 1 ? 'session' : 'sessions'}`), element('span', `status ${latest.progress}`, progressLabels[latest.progress]));
    activities.append(activity);
  });
  if (!summary.entries.length) {
    categories.append(element('p', 'recap-empty', 'No practice logged for this week yet.'));
    activities.append(element('p', 'recap-empty', 'Your songs, scales, techniques, and topics will appear here after you log a session.'));
  }
}
function renderHistory(sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)): void {
  const query = historySearch.value.trim().toLocaleLowerCase();
  const category = historyCategory.value;
  const filtered = sorted.filter(session => (category === 'All' || session.category === category) && `${session.song} ${session.notes} ${categoryLabels[session.category]}`.toLocaleLowerCase().includes(query));
  const filtering = category !== 'All' || query !== '';
  get('history-count').textContent = sessions.length ? `${filtered.length} of ${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}` : 'Your story starts here';
  get<HTMLButtonElement>('clear-filters').hidden = !filtering;
  get('legacy-note').hidden = !sessions.some(session => session.category === 'Uncategorized');
  const history = get('history'); history.replaceChildren();
  if (!sessions.length) history.append(emptyState('Your next session starts something.', 'Pick up your guitar, practice a little, then save what you worked on.'));
  else if (!filtered.length) history.append(emptyState('No matching sessions.', 'Try another name or category, or clear your filters.'));
  filtered.forEach(session => {
    const row = element('article', 'history-item');
    const date = new Date(session.date + 'T12:00:00');
    const stamp = element('div', 'session-date', date.toLocaleDateString(undefined, { month: 'short' }));
    stamp.append(element('strong', '', String(date.getDate())), document.createTextNode(String(date.getFullYear())));
    const body = element('div', 'session-body');
    body.append(element('div', 'session-title', session.song), element('span', `status ${session.progress}`, progressLabels[session.progress]));
    const categoryRow = element('div', 'session-category-row');
    const categoryLabel = element('label', '', 'Category') as HTMLLabelElement;
    const categorySelect = element('select', 'session-category') as HTMLSelectElement;
    categorySelect.id = `category-${session.id}`;
    categoryLabel.htmlFor = categorySelect.id;
    categorySelect.setAttribute('aria-label', `Practice category for ${session.song} on ${session.date}`);
    if (session.category === 'Uncategorized') {
      const option = element('option', '', 'Uncategorized — choose a category') as HTMLOptionElement;
      option.value = 'Uncategorized'; option.disabled = true; categorySelect.append(option);
    }
    categories.forEach(category => {
      const option = element('option', '', categoryLabels[category]) as HTMLOptionElement;
      option.value = category; categorySelect.append(option);
    });
    categorySelect.value = session.category;
    categorySelect.addEventListener('change', () => {
      try {
        updateCategory(session.id, categorySelect.value);
        const updated = document.getElementById(categorySelect.id);
        if (updated) updated.focus(); else historyCategory.focus();
      } catch (error) { categorySelect.value = session.category; setMessage((error as Error).message); }
    });
    categoryRow.append(categoryLabel, categorySelect); body.append(categoryRow);
    if (session.notes) body.append(element('p', 'session-notes', session.notes));
    const duration = element('div', 'session-minutes', String(session.minutes)); duration.append(element('span', '', ' min'));
    const remove = element('button', 'remove-button', 'Remove') as HTMLButtonElement;
    remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${session.song} session from ${session.date}`);
    remove.addEventListener('click', () => {
      if (!window.confirm(`Remove this ${session.minutes}-minute session of “${session.song}”?`)) return;
      try { persist(sessions.filter(item => item.id !== session.id)); setMessage('Session removed.'); songInput.focus(); }
      catch (error) { setMessage((error as Error).message); }
    });
    row.append(stamp, body, duration, remove); history.append(row);
  });
}
function updateDate(): void {
  dateInput.max = localDate(new Date()); dateInput.min = '1900-01-01';
  get('today-label').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
updateDate(); dateInput.value = localDate(new Date()); updateNameField(); fillGoalInputs(); render();
get('goal-form').addEventListener('submit', event => {
  event.preventDefault();
  const minutes = get<HTMLInputElement>('goal-minutes').value.trim();
  const days = get<HTMLInputElement>('goal-days').value.trim();
  try {
    if (!minutes && !days) throw new Error('Enter a time target or a practice-day target.');
    saveGoals(minutes ? Number(minutes) : null, days ? Number(days) : null);
  } catch (error) { get('goal-message').textContent = (error as Error).message; }
});
get('clear-goals').addEventListener('click', () => {
  try { saveGoals(null, null); fillGoalInputs(); }
  catch (error) { get('goal-message').textContent = (error as Error).message; }
});
get('previous-week').addEventListener('click', () => { if (!get<HTMLButtonElement>('previous-week').disabled) { recapOffset--; renderRecap(); } });
get('next-week').addEventListener('click', () => { if (recapOffset < 0) { recapOffset++; renderRecap(); } });
get('this-week').addEventListener('click', () => { recapOffset = 0; renderRecap(); });
categoryInput.addEventListener('change', updateNameField);
historySearch.addEventListener('input', () => renderHistory());
historyCategory.addEventListener('change', () => renderHistory());
get('clear-filters').addEventListener('click', () => { historySearch.value = ''; historyCategory.value = 'All'; renderHistory(); historySearch.focus(); });
window.addEventListener('focus', () => { updateDate(); render(); });
form.addEventListener('submit', event => {
  event.preventDefault();
  try {
    createSession({ song: songInput.value, category: categoryInput.value, minutes: Number(minutesInput.value), date: dateInput.value, progress: progressInput.value, notes: notesInput.value });
    notesInput.value = ''; songInput.focus();
  } catch (error) { setMessage((error as Error).message); }
});
// Optional browser API: agents use the same validation and save action as the form.
type Tool = { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown };
const modelContext = (document as Document & { modelContext?: { registerTool: (tool: Tool, options: { signal: AbortSignal }) => unknown } }).modelContext;
if (modelContext?.registerTool) {
  const lifecycle = new AbortController();
  try {
    Promise.resolve(modelContext.registerTool({
      name: 'log_guitar_practice', title: 'Log guitar practice',
      description: 'Save a guitar practice session in this browser and update the journal.',
      inputSchema: { type: 'object', properties: { song: { type: 'string', maxLength: 100 }, category: { type: 'string', enum: categories }, minutes: { type: 'integer', minimum: 1, maximum: 1440 }, date: { type: 'string', format: 'date' }, progress: { type: 'string', enum: ['Learning', 'Practicing', 'Comfortable'] }, notes: { type: 'string', maxLength: 1000 } }, required: ['song', 'category', 'minutes', 'date', 'progress', 'notes'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) { const session = createSession(input); return { id: session.id, song: session.song, minutes: session.minutes, saved: true }; }
    }, { signal: lifecycle.signal })).catch(() => {});
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  } catch { /* Optional API; the journal works without it. */ }
}
