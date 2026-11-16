// Sunny Side — демо приложения для гостей кафе (кафе вымышленное). Без сборки и без сервера:
// всё состояние лежит в localStorage этого браузера.

const STORE_KEY = "cafe-app-demo-v1";
const BONUS_RATE = 0.05;      // 5% от суммы заказа возвращается бонусами
const STAMPS_FOR_GIFT = 6;    // каждый шестой кофе в подарок
// Кафе вымышленное: адрес условный, WhatsApp и Telegram ведут на разработчика демо.
const CAFE = {
  address: "ул. Примерная, 1",
  hours: "Каждый день с 8:00 до 23:00",
  whatsapp: "818085228017",
  telegram: "Zhosek",
};

const defaults = () => ({
  tab: "menu",
  group: "kitchen",
  cart: {},
  mode: "togo",
  when: "asap",
  address: "",
  useBonus: false,
  bonus: 1250,
  stamps: 4,
  guest: { name: "Гость", phone: "" },
  orders: [],
  bookings: [],
  history: [
    { text: "Приветственные бонусы", delta: 1000 },
    { text: "Заказ на 5 000 ₸", delta: 250 },
  ],
});

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved) return Object.assign(defaults(), saved);
  } catch (e) { /* приватный режим или повреждённые данные — начинаем с чистого листа */ }
  return defaults();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* не критично */ }
}

let state = load();
let query = "";
let statusTimer = null;

const $ = (sel, root = document) => root.querySelector(sel);
const screen = $("#screen");
const money = (n) => n.toLocaleString("ru-RU").replace(/ /g, " ") + " ₸";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plural = (n, [one, few, many]) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/* ---------- корзина ---------- */

const cartLines = () => Object.entries(state.cart).filter(([id, q]) => ITEMS[id] && q > 0).map(([id, q]) => ({ item: ITEMS[id], qty: q }));
const cartCount = () => cartLines().reduce((s, l) => s + l.qty, 0);
const cartTotal = () => cartLines().reduce((s, l) => s + l.qty * l.item.price, 0);
const bonusToSpend = () => (state.useBonus ? Math.min(state.bonus, Math.floor(cartTotal() / 2)) : 0);

function changeQty(id, delta) {
  const next = (state.cart[id] || 0) + delta;
  if (next <= 0) delete state.cart[id]; else state.cart[id] = next;
  save();
}

/* ---------- общие куски разметки ---------- */

function stepper(id) {
  const qty = state.cart[id] || 0;
  const name = esc(ITEMS[id].name);
  if (!qty) return `<button class="add" data-add="${id}" aria-label="Добавить: ${name}">+</button>`;
  return `<span class="stepper">
    <button data-dec="${id}" aria-label="Убрать одну порцию: ${name}">−</button>
    <b aria-live="polite">${qty}</b>
    <button data-add="${id}" aria-label="Добавить ещё порцию: ${name}">+</button>
  </span>`;
}

function segment(name, options, current) {
  return `<div class="segment" role="group">${options.map(([val, label]) =>
    `<button data-${name}="${val}" aria-pressed="${val === current}">${label}</button>`).join("")}</div>`;
}

function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---------- экран «Меню» ---------- */

function renderMenu() {
  const cats = MENU.filter((c) => c.group === state.group);
  const q = query.trim().toLowerCase();
  const found = q
    ? MENU.map((c) => ({ ...c, items: c.items.filter((i) => (i.name + " " + i.desc).toLowerCase().includes(q)) })).filter((c) => c.items.length)
    : cats;

  const sections = found.map((c) => `
    <section class="cat" id="cat-${c.id}">
      <h2>${c.title}</h2>
      <ul class="dishes">
        ${c.items.map((i) => `
          <li class="dish">
            <div class="dish-text">
              <p class="dish-name"><span>${esc(i.name)}</span><i class="leader"></i><span class="price">${money(i.price)}</span></p>
              ${i.desc ? `<p class="dish-desc">${esc(i.desc)}</p>` : ""}
            </div>
            ${stepper(i.id)}
          </li>`).join("")}
      </ul>
    </section>`).join("");

  screen.innerHTML = `
    <header class="masthead">
      <h1 class="wordmark">Sunny <span>side</span></h1>
      <p>Завтраки весь день. Закажите заранее и заберите без очереди.</p>
    </header>
    <div class="menu-tools">
      <label class="search">
        <span class="visually-hidden">Поиск по меню</span>
        <input id="search" type="search" placeholder="Найти блюдо или напиток" value="${esc(query)}" autocomplete="off">
      </label>
      ${q ? "" : segment("group", [["kitchen", "Кухня"], ["bar", "Бар"]], state.group)}
      ${q ? "" : `<div class="chips">${cats.map((c) => `<button class="chip" data-jump="${c.id}">${c.title}</button>`).join("")}</div>`}
    </div>
    ${!q && state.group === "bar" ? `<p class="note">Цены в этом демо условные.</p>` : ""}
    ${sections || `<p class="empty">По запросу «${esc(query)}» ничего нет. Попробуйте другое слово, например «лосось» или «омлет».</p>`}
  `;
}

/* ---------- экран «Заказ» ---------- */

const STEP_MS = 5000; // в демо заказ «готовится» по 5 секунд на шаг

function syncOrders() {
  state.orders.forEach((o) => {
    if (o.step < 2) o.step = Math.min(2, Math.floor((Date.now() - o.created) / STEP_MS));
  });
}

function renderOrder() {
  syncOrders();
  const active = state.orders.find((o) => o.step < 3);
  if (active) return renderStatus(active);

  const lines = cartLines();
  if (!lines.length) {
    const last = state.orders[0];
    screen.innerHTML = `
      <header class="page-head"><h1>Заказ</h1></header>
      <p class="empty">В заказе пока пусто. Выберите что-нибудь в меню, и мы приготовим к вашему приходу.</p>
      <button class="primary" data-tab="menu">Открыть меню</button>
      ${last ? `<p class="note">Последний заказ №${last.no} на ${money(last.total)} выдан.</p>` : ""}`;
    return;
  }

  const total = cartTotal();
  const spend = bonusToSpend();
  const toPay = total - spend;
  const earn = Math.round(toPay * BONUS_RATE);
  const canSpend = Math.min(state.bonus, Math.floor(total / 2));

  screen.innerHTML = `
    <header class="page-head"><h1>Заказ</h1></header>
    <ul class="dishes compact">
      ${lines.map(({ item, qty }) => `
        <li class="dish">
          <div class="dish-text">
            <p class="dish-name"><span>${esc(item.name)}</span><i class="leader"></i><span class="price">${money(item.price * qty)}</span></p>
          </div>
          ${stepper(item.id)}
        </li>`).join("")}
    </ul>

    <h2 class="field-title">Как получить</h2>
    ${segment("mode", [["togo", "С собой"], ["hall", "В зале"], ["delivery", "Доставка"]], state.mode)}
    ${state.mode === "delivery" ? `
      <label class="field"><span>Адрес доставки</span>
        <input id="address" type="text" placeholder="Улица, дом, квартира" value="${esc(state.address)}" autocomplete="street-address">
      </label>` : ""}

    <h2 class="field-title">Когда</h2>
    ${segment("when", [["asap", "Сразу"], ["15", "Через 15 мин"], ["30", "Через 30 мин"], ["60", "Через час"]], state.when)}

    ${canSpend > 0 ? `
      <label class="switch">
        <input id="usebonus" type="checkbox" ${state.useBonus ? "checked" : ""}>
        <span>Списать ${canSpend.toLocaleString("ru-RU")} ${plural(canSpend, ["бонус", "бонуса", "бонусов"])}</span>
      </label>` : ""}

    <dl class="summary">
      <div><dt>Сумма</dt><dd>${money(total)}</dd></div>
      ${spend ? `<div><dt>Бонусами</dt><dd>− ${money(spend)}</dd></div>` : ""}
      <div class="grand"><dt>К оплате</dt><dd>${money(toPay)}</dd></div>
      <div class="soft"><dt>Вернётся бонусами</dt><dd>+ ${earn.toLocaleString("ru-RU")}</dd></div>
    </dl>

    <button class="primary" id="pay">Оплатить через Kaspi</button>
    <p class="note">Это демо: деньги не списываются, заказ в кафе не уходит.</p>`;
}

const STEPS = ["Заказ принят", "Готовим", "Готов, можно забирать"];
const STEP_HINT = {
  togo: ["Передали на кухню и бариста.", "Осталось несколько минут.", "Назовите номер заказа на кассе."],
  hall: ["Передали на кухню и бариста.", "Осталось несколько минут.", "Официант принесёт заказ за ваш стол."],
  delivery: ["Передали на кухню и бариста.", "Осталось несколько минут.", "Курьер уже выехал к вам."],
};

function renderStatus(order) {
  screen.innerHTML = `
    <header class="page-head">
      <h1>Заказ №${order.no}</h1>
      <p>${money(order.total)}, ${order.count} ${plural(order.count, ["позиция", "позиции", "позиций"])}</p>
    </header>
    <ol class="steps">
      ${STEPS.map((s, i) => `
        <li class="${i < order.step ? "done" : i === order.step ? "now" : ""}">
          <b>${i === 2 && order.mode !== "togo" ? (order.mode === "hall" ? "Готов, несём к столу" : "Готов, курьер в пути") : s}</b>
          ${i === order.step ? `<span>${STEP_HINT[order.mode][i]}</span>` : ""}
        </li>`).join("")}
    </ol>
    ${order.step === 2 ? `<button class="primary" id="received">Заказ получен</button>` : `<p class="note">В демо статус меняется сам каждые несколько секунд.</p>`}`;

  clearTimeout(statusTimer);
  if (order.step < 2) statusTimer = setTimeout(() => { if (state.tab === "order") render(); }, 1000);
}

function pay() {
  if (state.mode === "delivery" && !state.address.trim()) {
    toast("Укажите адрес доставки");
    $("#address")?.focus();
    return;
  }
  const lines = cartLines();
  const total = cartTotal();
  const spend = bonusToSpend();
  const toPay = total - spend;
  const earn = Math.round(toPay * BONUS_RATE);
  const coffees = lines.filter((l) => l.item.coffee).reduce((s, l) => s + l.qty, 0);
  const no = 100 + state.orders.length + 1;

  state.bonus += earn - spend;
  state.stamps += coffees;
  if (spend) state.history.unshift({ text: `Оплата бонусами, заказ №${no}`, delta: -spend });
  state.history.unshift({ text: `Заказ №${no} на ${money(toPay)}`, delta: earn });
  state.orders.unshift({ no, total: toPay, count: cartCount(), mode: state.mode, step: 0, created: Date.now() });
  state.cart = {};
  state.useBonus = false;
  save();
  render();
  toast(`Оплачено. Начислили ${earn} ${plural(earn, ["бонус", "бонуса", "бонусов"])}`);
}

/* ---------- экран «Бонусы» ---------- */

function qrSvg(text) {
  if (typeof qrcode !== "function") return `<p class="qr-fallback">${esc(text)}</p>`;
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

function renderBonus() {
  const gifts = Math.floor(state.stamps / STAMPS_FOR_GIFT);
  const filled = state.stamps % STAMPS_FOR_GIFT;
  const left = STAMPS_FOR_GIFT - filled;
  const eggs = Array.from({ length: STAMPS_FOR_GIFT }, (_, i) =>
    `<li class="egg ${i < filled ? "on" : ""}" style="--tilt:${[-8, 5, -3, 9, -6, 4][i]}deg"><i></i></li>`).join("");

  screen.innerHTML = `
    <header class="page-head"><h1>Бонусы</h1></header>

    <section class="card">
      <div>
        <p class="card-label">На счёте</p>
        <p class="balance">${state.bonus.toLocaleString("ru-RU").replace(/ /g, " ")}</p>
        <p class="card-hint">1 бонус = 1 тенге. Возвращаем 5% с каждого заказа.</p>
      </div>
      <div class="qr" aria-label="QR-код гостя">${qrSvg("DEMO-GUEST-000482")}</div>
    </section>
    <p class="note">Покажите код кассиру, если заказываете в зале.</p>

    <section class="stamps">
      <h2>Шестой кофе в подарок</h2>
      <ul class="eggs" aria-label="Отмечено ${filled} из ${STAMPS_FOR_GIFT}">${eggs}</ul>
      <p>${gifts
        ? `У вас ${gifts} ${plural(gifts, ["подарочный кофе", "подарочных кофе", "подарочных кофе"])}. Скажите бариста при заказе.`
        : `Ещё ${left} ${plural(left, ["кофе", "кофе", "кофе"])}, и следующий за наш счёт.`}</p>
    </section>

    <section>
      <h2 class="field-title">История</h2>
      <ul class="history">
        ${state.history.slice(0, 8).map((h) => `
          <li><span>${esc(h.text)}</span><b class="${h.delta < 0 ? "minus" : ""}">${h.delta > 0 ? "+" : "−"} ${Math.abs(h.delta).toLocaleString("ru-RU")}</b></li>`).join("")}
      </ul>
    </section>`;
}

/* ---------- экран «Кафе» ---------- */

function renderCafe() {
  const today = new Date();
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const max = new Date(today); max.setDate(max.getDate() + 30);
  const times = [];
  for (let h = 8; h <= 21; h++) times.push(`${String(h).padStart(2, "0")}:00`, `${String(h).padStart(2, "0")}:30`);

  screen.innerHTML = `
    <header class="page-head"><h1>Кафе</h1><p>${CAFE.address}</p></header>

    ${state.bookings.length ? `
      <section>
        <h2 class="field-title">Ваши брони</h2>
        <ul class="history">
          ${state.bookings.map((b, i) => `
            <li><span>${esc(b.dateLabel)}, ${esc(b.time)}, ${b.guests} ${plural(b.guests, ["гость", "гостя", "гостей"])}</span>
            <button class="link" data-cancel="${i}">Отменить</button></li>`).join("")}
        </ul>
      </section>` : ""}

    <form id="booking" class="booking">
      <h2 class="field-title">Забронировать стол</h2>
      <div class="row">
        <label class="field"><span>Дата</span><input name="date" type="date" required min="${iso(today)}" max="${iso(max)}" value="${iso(today)}"></label>
        <label class="field"><span>Время</span><select name="time">${times.map((t) => `<option ${t === "10:00" ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span>Сколько гостей</span>
        <select name="guests">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option ${n === 2 ? "selected" : ""}>${n}</option>`).join("")}</select>
      </label>
      <label class="field"><span>Имя</span><input name="name" type="text" required autocomplete="given-name" value="${esc(state.guest.name === "Гость" ? "" : state.guest.name)}"></label>
      <label class="field"><span>Телефон</span><input name="phone" type="tel" required placeholder="+7 7__ ___ __ __" autocomplete="tel" value="${esc(state.guest.phone)}"></label>
      <button class="primary" type="submit">Забронировать стол</button>
    </form>

    <section class="contacts">
      <h2 class="field-title">Как нас найти</h2>
      <p>${CAFE.hours}</p>
      <a class="secondary" href="https://wa.me/${CAFE.whatsapp}" target="_blank" rel="noopener">Написать в WhatsApp</a>
      <a class="secondary" href="https://t.me/${CAFE.telegram}" target="_blank" rel="noopener">Написать в Telegram</a>
    </section>

    <p class="note">Демо-концепт: кафе Sunny Side вымышленное, заказы и брони никуда не передаются. Кнопки связи ведут к разработчику.</p>
    <button class="link" id="reset">Сбросить данные демо</button>`;
}

function book(form) {
  const data = Object.fromEntries(new FormData(form));
  const d = new Date(data.date + "T00:00");
  const dateLabel = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  state.guest = { name: data.name.trim(), phone: data.phone.trim() };
  state.bookings.unshift({ dateLabel, time: data.time, guests: Number(data.guests) });
  save();
  render();
  toast(`Стол забронирован на ${dateLabel}, ${data.time}`);
}

/* ---------- каркас ---------- */

const SCREENS = { menu: renderMenu, order: renderOrder, bonus: renderBonus, cafe: renderCafe };

function renderChrome() {
  document.querySelectorAll(".tab").forEach((t) => {
    if (t.dataset.tab === state.tab) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
  });
  const count = cartCount();
  const badge = $("#tabcount");
  badge.hidden = !count;
  badge.textContent = count;
  const bar = $("#cartbar");
  bar.hidden = !(count && state.tab === "menu");
  bar.innerHTML = `<span>${count} ${plural(count, ["позиция", "позиции", "позиций"])}</span><b>Перейти к заказу, ${money(cartTotal())}</b>`;
}

function render() {
  clearTimeout(statusTimer);
  const y = screen.scrollTop;
  SCREENS[state.tab]();
  screen.scrollTop = y;
  renderChrome();
}

function go(tab) {
  state.tab = tab;
  save();
  render();
  screen.scrollTop = 0;
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("button, a");
  if (!t) return;
  const d = t.dataset;
  if (d.tab) return go(d.tab);
  if (t.id === "cartbar") return go("order");
  if (d.add) { changeQty(d.add, 1); return render(); }
  if (d.dec) { changeQty(d.dec, -1); return render(); }
  if (d.group) { state.group = d.group; save(); render(); screen.scrollTop = 0; return; }
  if (d.mode) { state.mode = d.mode; save(); return render(); }
  if (d.when) { state.when = d.when; save(); return render(); }
  if (d.jump) {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    return $("#cat-" + d.jump)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }
  if (t.id === "pay") return pay();
  if (t.id === "received") {
    state.orders.forEach((o) => { o.step = 3; });
    save(); render();
    return toast("Приятного аппетита");
  }
  if (d.cancel) { state.bookings.splice(Number(d.cancel), 1); save(); render(); return toast("Бронь отменена"); }
  if (t.id === "reset") {
    state = defaults();
    query = "";
    save(); render();
    screen.scrollTop = 0;
    return toast("Демо начато заново");
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    query = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = $("#search");
    input.focus();
    input.setSelectionRange(pos, pos);
  }
  if (e.target.id === "address") { state.address = e.target.value; save(); }
});

document.addEventListener("change", (e) => {
  if (e.target.id === "usebonus") { state.useBonus = e.target.checked; save(); render(); }
});

document.addEventListener("submit", (e) => {
  if (e.target.id === "booking") { e.preventDefault(); book(e.target); }
});

render();
