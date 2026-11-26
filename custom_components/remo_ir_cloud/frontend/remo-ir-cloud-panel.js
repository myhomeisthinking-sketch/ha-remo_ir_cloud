/* Remo IR Cloud panel — vanilla web component for Home Assistant (admin only). */

const API = "remo_ir_cloud";
const SLUG_RE = /^[a-z0-9_]{1,40}$/;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CSS = `
:host { display:block; min-height:100vh; background:var(--primary-background-color); color:var(--primary-text-color);
  font-family:var(--paper-font-body1_-_font-family, Roboto, "Noto Sans JP", sans-serif); font-size:14px; }
header { display:flex; align-items:center; gap:8px; height:56px; padding:0 12px;
  background:var(--app-header-background-color, var(--primary-color)); color:var(--app-header-text-color, #fff); }
h1 { margin:0; font-size:20px; font-weight:400; }
main { max-width:860px; margin:0 auto; padding:4px 16px 64px; }
section { padding:22px 0; border-bottom:1px solid var(--divider-color); }
section:last-child { border-bottom:0; }
h2 { margin:0 0 12px; font-size:16px; font-weight:500; }
h3 { margin:0 0 12px; font-size:18px; font-weight:500; }
p { margin:0 0 10px; line-height:1.6; }
label { display:block; margin:14px 0 4px; font-size:13px; color:var(--secondary-text-color); }
.hint, .state, .sub { color:var(--secondary-text-color); font-size:13px; }
.warn { color:var(--warning-color, #b26a00); }
.err { color:var(--error-color); min-height:18px; font-size:13px; }
.empty { color:var(--secondary-text-color); }
button { font:inherit; min-height:36px; padding:6px 14px; border-radius:8px; cursor:pointer;
  border:1px solid var(--divider-color); background:var(--card-background-color); color:var(--primary-text-color); }
button.primary { background:var(--primary-color); color:var(--text-primary-color, #fff); border-color:transparent; }
button.danger { color:var(--error-color); }
button:disabled { opacity:.5; cursor:default; }
:host(.working) button { pointer-events:none; opacity:.6; }
:focus-visible { outline:2px solid var(--primary-color); outline-offset:2px; }
input, select { font:inherit; box-sizing:border-box; width:100%; min-height:36px; padding:6px 10px; border-radius:8px;
  border:1px solid var(--divider-color); background:var(--card-background-color); color:var(--primary-text-color); }
input.invalid { border-color:var(--error-color); }
.row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.row select { flex:1 1 220px; width:auto; }
.idrow { display:flex; }
.prefix { display:flex; align-items:center; padding:0 10px; white-space:nowrap; font-family:monospace; color:var(--secondary-text-color);
  background:var(--secondary-background-color); border:1px solid var(--divider-color); border-right:0; border-radius:8px 0 0 8px; }
.idrow input { border-radius:0 8px 8px 0; font-family:monospace; }
.banner { padding:10px 12px; border-radius:8px; margin:10px 0; background:var(--secondary-background-color); line-height:1.6; }
.banner.warn { border-left:4px solid var(--warning-color, #b26a00); }
.banner.ok { border-left:4px solid var(--success-color, #2e7d32); }
.list { list-style:none; margin:0; padding:0; }
.list li { display:flex; align-items:center; gap:12px; padding:10px 0; border-top:1px solid var(--divider-color); }
.list li:first-child { border-top:0; }
.list ha-icon { flex:none; color:var(--secondary-text-color); }
.list .main { flex:1; min-width:0; }
.list .name { font-weight:500; overflow-wrap:anywhere; }
.meta { display:flex; flex-wrap:wrap; gap:2px 14px; }
.actions { display:flex; flex:none; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
#msg { position:sticky; top:0; z-index:5; }
.toast { padding:10px 16px; white-space:pre-line; line-height:1.5; background:var(--primary-text-color); color:var(--primary-background-color); }
.toast.error { background:var(--error-color); color:#fff; }
.toast.warn { background:var(--warning-color, #b26a00); color:#fff; }
.backdrop { position:fixed; inset:0; z-index:10; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(0,0,0,.5); }
.dialog { width:min(480px,100%); max-height:90vh; overflow:auto; padding:20px; border-radius:12px;
  background:var(--card-background-color); color:var(--primary-text-color); }
.dialog .actions { margin-top:20px; justify-content:flex-end; }
.refs { margin:8px 0; padding-left:18px; font-size:13px; overflow-wrap:anywhere; }
ol.steps { margin:0 0 8px; padding-left:22px; line-height:1.8; }
.note { margin:0 0 12px; font-size:13px; line-height:1.6; color:var(--secondary-text-color); }
details { margin-top:16px; padding:0 12px; border:1px solid var(--divider-color); border-radius:8px; }
summary { padding:10px 0; font-weight:500; cursor:pointer; }
details[open] > summary { margin-bottom:2px; }
@media (max-width:560px) { .list li { flex-wrap:wrap; } .actions { width:100%; justify-content:flex-start; } }
.pick { margin-top:16px; }
`;

class RemoIrCloudPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.s = { st: null, signals: [], sigErr: "", sel: "", regIcon: "", regArea: "", buttons: [], buttonsErr: "", modal: null };
    this._pickers = new Set();
    this._ready = false;
    this._working = false;
  }

  set hass(hass) {
    this._hass = hass;
    this._pickers.forEach((p) => { p.hass = hass; });
    if (this._menu) this._menu.hass = hass;
    if (!this._ready) {
      this._ready = true;
      this._init();
    }
  }

  set narrow(v) {
    this._narrow = v;
    if (this._menu) this._menu.narrow = v;
  }

  // ------------------------------------------------------------------ setup

  _init() {
    const root = this.shadowRoot;
    root.innerHTML = `<style>${CSS}</style>
      <header><span id="menuSlot"></span><h1>Remo IR Cloud</h1></header>
      <div id="msg" role="status" aria-live="polite"></div>
      <main><section id="secCloud"></section><section id="secSignal"></section><section id="secList"></section></main>
      <div id="modal"></div>`;
    if (customElements.get("ha-menu-button")) {
      const m = document.createElement("ha-menu-button");
      m.hass = this._hass;
      m.narrow = this._narrow;
      root.getElementById("menuSlot").appendChild(m);
      this._menu = m;
    }
    root.addEventListener("click", (e) => this._onClick(e));
    root.addEventListener("change", (e) => this._onChange(e));
    root.addEventListener("input", (e) => this._onInput(e));
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.s.modal) this._closeModal();
    });
    this._renderCloud();
    this._renderSignal();
    this._renderList();
    this._work(async () => {
      await this._loadStatus();
      await this._loadSignals();
      await this._loadButtons();
    });
  }

  async _api(method, path, body) {
    try {
      return await this._hass.callApi(method, `${API}/${path}`, body);
    } catch (e) {
      const b = e && e.body && typeof e.body === "object" ? e.body : {};
      const err = new Error(b.error || b.message || (e && (e.error || e.message)) || "通信に失敗しました");
      err.body = b;
      err.status = e && e.status_code;
      throw err;
    }
  }

  async _work(fn) {
    if (this._working) return;
    this._working = true;
    this.classList.add("working");
    try {
      await fn();
    } catch (e) {
      this._toast(e.message || String(e), "error");
    } finally {
      this._working = false;
      this.classList.remove("working");
    }
  }

  _toast(text, kind = "info") {
    const el = this.shadowRoot.getElementById("msg");
    el.innerHTML = `<div class="toast ${kind}">${esc(text)}</div>`;
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { el.innerHTML = ""; }, kind === "info" ? 6000 : 14000);
  }

  _q(id) {
    const el = this.shadowRoot.getElementById(id);
    return el ? el.value.trim() : "";
  }

  // ---------------------------------------------------------------- loading

  async _loadStatus() {
    this.s.st = await this._api("GET", "status");
    this._renderCloud();
  }

  async _loadSignals() {
    try {
      const r = await this._api("GET", "signals");
      this.s.signals = r.signals;
      this.s.sigErr = "";
    } catch (e) {
      this.s.signals = [];
      this.s.sigErr = e.message;
    }
    if (!this.s.signals.some((x) => x.signal_id === this.s.sel)) this.s.sel = this.s.signals[0]?.signal_id || "";
    this._renderSignal();
  }

  async _loadButtons() {
    try {
      const r = await this._api("GET", "buttons");
      this.s.buttons = r.buttons;
      this.s.buttonsErr = "";
    } catch (e) {
      this.s.buttons = [];
      this.s.buttonsErr = e.message;
    }
    this._renderList();
  }

  // -------------------------------------------------------------- rendering

  _sec(id, html) {
    this.shadowRoot.getElementById(id).innerHTML = html;
  }

  _iconField(slot, value, onChange) {
    this._pickers.forEach((p) => { if (!p.isConnected) this._pickers.delete(p); });
    slot.textContent = "";
    let el;
    const label = "アイコン(任意)";
    if (customElements.get("ha-selector")) {
      el = document.createElement("ha-selector");
      el.hass = this._hass;
      el.selector = { icon: {} };
      el.value = value || "";
      el.label = label;
      el.required = false;
      el.addEventListener("value-changed", (e) => { e.stopPropagation(); onChange(e.detail.value || ""); });
    } else if (customElements.get("ha-icon-picker")) {
      el = document.createElement("ha-icon-picker");
      el.hass = this._hass;
      el.value = value || "";
      el.label = label;
      el.addEventListener("value-changed", (e) => { e.stopPropagation(); onChange(e.detail.value || ""); });
    } else {
      // フォールバック: テキスト入力
      slot.innerHTML = `<label for="iconText">${label}</label><input id="iconText" placeholder="mdi:television" autocomplete="off" spellcheck="false">`;
      el = slot.querySelector("input");
      el.value = value || "";
      el.addEventListener("input", () => onChange(el.value.trim()));
      return;
    }
    this._pickers.add(el);
    slot.appendChild(el);
  }

  _areaField(slot, value, onChange) {
    this._pickers.forEach((p) => { if (!p.isConnected) this._pickers.delete(p); });
    slot.textContent = "";
    let el;
    const label = "エリア(任意)";
    if (customElements.get("ha-selector")) {
      el = document.createElement("ha-selector");
      el.hass = this._hass;
      el.selector = { area: {} };
      el.value = value || "";
      el.label = label;
      el.required = false;
      el.addEventListener("value-changed", (e) => { e.stopPropagation(); onChange(e.detail.value || ""); });
    } else if (customElements.get("ha-area-picker")) {
      el = document.createElement("ha-area-picker");
      el.hass = this._hass;
      el.value = value || "";
      el.label = label;
      el.addEventListener("value-changed", (e) => { e.stopPropagation(); onChange(e.detail.value || ""); });
    } else {
      // フォールバック: HAのエリア一覧から選ぶ
      const areas = Object.values((this._hass && this._hass.areas) || {})
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "ja"));
      slot.innerHTML = `<label for="areaSel">${label}</label><select id="areaSel"><option value="">(指定なし)</option>` +
        areas.map((a) => `<option value="${esc(a.area_id)}">${esc(a.name)}</option>`).join("") + `</select>`;
      el = slot.querySelector("select");
      el.value = value || "";
      el.addEventListener("change", () => onChange(el.value));
      return;
    }
    this._pickers.add(el);
    slot.appendChild(el);
  }

  _renderCloud() {
    const st = this.s.st;
    if (!st) {
      this._sec("secCloud", `<h2>Nature Remo クラウド</h2><p class="hint">読み込み中…</p>`);
      return;
    }
    if (!st.configured) {
      this._sec("secCloud", `<h2>Nature Remo クラウド</h2><p class="empty">アクセストークンが未設定です。</p>
        <div class="row"><button class="primary" data-act="editToken">トークンを設定</button></div>`);
      return;
    }
    const rl = st.rate_limit && st.rate_limit.limit != null
      ? `、取得時点のAPI残り ${esc(st.rate_limit.remaining)}/${esc(st.rate_limit.limit)}回` : "";
    const state = st.fetched_at
      ? `信号 ${esc(st.count)}件、最終取得 ${esc(new Date(st.fetched_at).toLocaleString("ja-JP"))}${rl}`
      : "まだ情報を取得していません。「情報を取得」を押してください。";
    this._sec("secCloud", `<h2>Nature Remo クラウド</h2>
      <div class="row"><button${st.fetched_at ? "" : ' class="primary"'} data-act="fetch" title="クラウドに問い合わせて、家電と信号の一覧を取得します(押したときだけ通信します)">情報を取得</button>
        <button data-act="editToken">設定</button></div>
      <p class="state">${state}</p>
      ${st.auth_failed ? `<div class="banner warn">トークンが無効です(リセットされた可能性があります)。「設定」から新しいトークンを入力してください。</div>` : ""}`);
  }

  _renderSignal() {
    const { st, signals, sigErr, sel } = this.s;
    if (!st || !st.configured) { this._sec("secSignal", ""); return; }
    let html = `<h2>信号を登録</h2>`;
    if (sigErr) {
      this._sec("secSignal", html + `<div class="banner warn">${esc(sigErr)}</div>`);
      return;
    }
    if (!signals.length) {
      this._sec("secSignal", html + `<p class="empty">信号の一覧がありません。上の「情報を取得」を押してください。</p>`);
      return;
    }
    const cur = signals.find((x) => x.signal_id === sel) || signals[0];
    const opts = signals
      .map((x) => `<option value="${esc(x.signal_id)}"${x.signal_id === cur.signal_id ? " selected" : ""}>${esc(x.label)}${x.button ? "(登録済み)" : ""}</option>`)
      .join("");
    html += `<ol class="steps"><li>登録する信号を選んでください。</li>
        <li>必要なら「テスト送信」で動作を確認してください。</li></ol>
      <p class="note">※テスト送信は、クラウド経由で実際に信号を送信します。</p>
      <div class="row"><select id="sigSel" aria-label="信号">${opts}</select>
        <button data-act="testSend">テスト送信</button></div>`;
    if (cur.button) {
      html += `<div class="banner ok">この信号は <b>${esc(cur.button.entity_id)}</b>(${esc(cur.button.alias)})として登録済みです。追加の登録は不要です。</div>`;
    } else {
      const alias = [cur.appliance, cur.signal].filter(Boolean).join(" ");
      html += `<div class="banner" style="margin-top:16px">未登録の信号です。ボタンとして登録できます。</div>
        <label for="slug">エンティティID</label>
        <div class="idrow"><span class="prefix">button.remocloud_</span>
          <input id="slug" placeholder="tv_power" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40"></div>
        <div class="err" id="slugErr"></div>
        <p class="hint">「機器_操作」の形で入力します(例 tv_power、aircon_cool_26)。</p>
        <label for="alias">アクション名称</label>
        <p class="note" style="margin:0 0 6px">ダッシュボードの登録時に表示される名称、アイコン、エリアを以下に入力してください。</p>
        <input id="alias" placeholder="テレビ 電源" maxlength="80" value="${esc(alias)}">
        <div id="regIconSlot" class="pick"></div><div id="regAreaSlot" class="pick"></div>
        <div class="row" style="margin-top:16px"><button class="primary" data-act="register">ボタンを追加</button></div>`;
    }
    this._sec("secSignal", html);
    const slot = this.shadowRoot.getElementById("regIconSlot");
    if (slot) this._iconField(slot, this.s.regIcon, (v) => { this.s.regIcon = v; });
    const aslot = this.shadowRoot.getElementById("regAreaSlot");
    if (aslot) this._areaField(aslot, this.s.regArea, (v) => { this.s.regArea = v; });
  }

  _renderList() {
    const { buttons, buttonsErr } = this.s;
    let html = `<h2>登録済みのボタン</h2>`;
    if (buttonsErr) {
      html += `<div class="banner warn">${esc(buttonsErr)}</div>`;
    } else if (!buttons.length) {
      html += `<p class="empty">まだボタンがありません。信号を選んで登録すると、ここに並びます。</p>`;
    } else {
      html += `<ul class="list">${buttons.map((s) => `<li>
        <ha-icon icon="${esc(s.icon || "mdi:remote")}"></ha-icon>
        <div class="main"><div class="name">${esc(s.alias)}</div>
          <div class="sub meta"><span>${esc(s.entity_id)}</span><span>${esc(s.label || (s.signal_id ? `信号ID ${s.signal_id.slice(0, 8)}…(一覧にありません)` : ""))}</span></div>
          ${s.signal_id ? "" : `<div class="sub warn">信号IDを読み取れません</div>`}
          </div>
        <div class="actions"><button data-act="sendButton" data-key="${esc(s.key)}">送信</button>
          <button data-act="editButton" data-key="${esc(s.key)}">編集</button>
          <button class="danger" data-act="deleteButton" data-key="${esc(s.key)}">削除</button></div></li>`).join("")}</ul>`;
    }
    this._sec("secList", html);
  }

  // ----------------------------------------------------------------- modals

  _openModal(m) { this.s.modal = m; this._renderModal(); }

  _closeModal() {
    this.s.modal = null;
    this._renderModal();
  }

  _signalOptions(selected) {
    const { signals } = this.s;
    const known = signals.some((x) => x.signal_id === selected);
    return (known ? "" : `<option value="${esc(selected)}" selected>${esc(selected)}(一覧にありません)</option>`) +
      signals.map((x) => `<option value="${esc(x.signal_id)}"${x.signal_id === selected ? " selected" : ""}>${esc(x.label)}</option>`).join("");
  }

  _renderModal() {
    const el = this.shadowRoot.getElementById("modal");
    const m = this.s.modal;
    if (!m) { el.innerHTML = ""; return; }
    let inner = "";
    if (m.type === "token") {
      inner = `<h3>アクセストークンの設定</h3>
        <p class="hint">Nature Remoのアクセストークン(https://home.nature.global で発行)を入力してください。トークンをリセットした場合は、新しいトークンを入力します。保存前に、クラウドで有効かどうかを確認します。</p>
        <label for="tok">アクセストークン</label>
        <input id="tok" type="password" placeholder="${m.configured ? "変更する場合のみ入力" : ""}" autocomplete="off" spellcheck="false">
        <div class="actions"><button data-act="modalClose">キャンセル</button><button class="primary" data-act="modalSaveToken">保存</button></div>`;
    } else if (m.type === "editButton") {
      inner = `<h3>${esc(m.entity_id)} を編集</h3>
        <p class="hint">エンティティIDの変更は、HAの「設定 → デバイスとサービス → エンティティ」から行ってください。</p>
        <label for="eAlias">アクション名称</label>
        <p class="note" style="margin:0 0 6px">ダッシュボードの登録時に表示される名称、アイコン、エリアを以下に入力してください。</p>
        <input id="eAlias" value="${esc(m.alias)}" maxlength="80">
        <div id="eIconSlot" class="pick"></div><div id="eAreaSlot" class="pick"></div>
        <label for="eSignal">送信する信号</label><select id="eSignal">${this._signalOptions(m.signal_id)}</select>
        <div class="row" style="margin-top:12px"><button data-act="modalTestSel">この信号をテスト送信</button></div>
        <div class="actions"><button data-act="modalClose">キャンセル</button><button class="primary" data-act="modalSaveButton">保存</button></div>`;
    } else if (m.type === "deleteButton") {
      inner = `<h3>削除の確認</h3><p>${esc(m.entity_id)}(${esc(m.alias)})を削除します。</p>
        <div id="refsBox">${this._refsHtml(m.refs)}</div>
        <p class="hint">このボタンのエンティティも、あわせて削除されます。</p>
        <div class="actions"><button data-act="modalClose">キャンセル</button><button class="danger" data-act="modalConfirmDelete">削除する</button></div>`;
    }
    el.innerHTML = `<div class="backdrop" data-act="modalBackdrop"><div class="dialog" role="dialog" aria-modal="true">${inner}</div></div>`;
    if (m.type === "editButton") {
      this._iconField(this.shadowRoot.getElementById("eIconSlot"), m.icon, (v) => { m.icon = v; });
      this._areaField(this.shadowRoot.getElementById("eAreaSlot"), m.area_id, (v) => { m.area_id = v; });
    }
  }

  _refsHtml(refs) {
    if (refs === null) return `<p class="hint">参照を確認中…</p>`;
    if (!refs.length) return `<p class="hint">他の設定からの参照は見つかりませんでした。</p>`;
    return `<div class="banner warn">次の場所から参照されています。削除すると動かなくなります。
      <ul class="refs">${refs.map((r) => `<li>${esc(r.file)} の ${r.line} 行目: ${esc(r.text)}</li>`).join("")}</ul></div>`;
  }

  _syncButtonModal() {
    const m = this.s.modal;
    if (!m || m.type !== "editButton") return;
    m.alias = this._q("eAlias");
    m.signal_id = this._q("eSignal") || m.signal_id;
  }

  // ----------------------------------------------------------------- events

  _onChange(e) {
    if (e.target.id === "sigSel") {
      this.s.sel = e.target.value;
      this.s.regIcon = ""; this.s.regArea = "";
      this._renderSignal();
    }
  }

  _onInput(e) {
    if (e.target.id !== "slug") return;
    const v = e.target.value;
    const ok = v === "" || SLUG_RE.test(v);
    this.shadowRoot.getElementById("slugErr").textContent = ok ? "" : "小文字英数字とアンダースコアのみ、40文字以内で入力してください";
    e.target.classList.toggle("invalid", !ok);
  }

  _onClick(e) {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const act = t.dataset.act;
    if (act === "modalBackdrop") {
      if (e.target === t) this._closeModal();
      return;
    }
    const key = t.dataset.key;
    const s = this.s;
    const handlers = {
      fetch: () => this._work(async () => {
        s.st = await this._api("POST", "fetch", {});
        await this._loadSignals();
        this._renderCloud();
        this._toast(`信号の一覧を取得しました(${s.st.count}件)`);
      }),
      editToken: () => this._openModal({ type: "token", configured: !!(s.st && s.st.configured) }),
      modalClose: () => this._closeModal(),
      modalSaveToken: () => this._work(async () => {
        const token = this._q("tok");
        if (!token) { this._toast("アクセストークンを入力してください", "error"); return; }
        s.st = await this._api("PUT", "token", { token });
        this._closeModal();
        this._renderCloud();
        await this._loadSignals();
        this._toast("トークンを保存しました。信号の一覧が古い場合は「情報を取得」を押してください");
      }),
      testSend: () => this._work(async () => {
        await this._api("POST", "test_send", { signal_id: s.sel });
        this._toast("テスト送信しました");
      }),
      register: () => this._work(async () => {
        const slug = this._q("slug");
        if (!SLUG_RE.test(slug)) {
          this._toast("エンティティIDは小文字英数字とアンダースコアで入力してください", "error");
          return;
        }
        const r = await this._api("POST", "buttons", {
          signal_id: s.sel, slug, alias: this._q("alias"), icon: s.regIcon, area_id: s.regArea,
        });
        s.regIcon = ""; s.regArea = "";
        await this._loadButtons();
        await this._loadSignals();
        this._toast(`${r.entity_id} を追加しました`);
      }),
      sendButton: () => this._work(async () => {
        await this._api("POST", `buttons/${encodeURIComponent(key)}/send`, {});
        this._toast("送信しました");
      }),
      editButton: () => {
        const sc = s.buttons.find((x) => x.key === key);
        if (sc) this._openModal({ type: "editButton", key, entity_id: sc.entity_id, alias: sc.alias, icon: sc.icon, area_id: sc.area_id || "", signal_id: sc.signal_id });
      },
      modalTestSel: () => this._work(async () => {
        this._syncButtonModal();
        await this._api("POST", "test_send", { signal_id: s.modal.signal_id });
        this._toast("選択した信号を送信しました");
      }),
      modalSaveButton: () => this._work(async () => {
        this._syncButtonModal();
        const m = s.modal;
        await this._api("PUT", `buttons/${encodeURIComponent(m.key)}`, { alias: m.alias, icon: m.icon || "", area_id: m.area_id || "", signal_id: m.signal_id });
        this._closeModal();
        await this._loadButtons();
        await this._loadSignals();
        this._toast(`${m.entity_id} を保存しました`);
      }),
      deleteButton: () => {
        const sc = s.buttons.find((x) => x.key === key);
        if (!sc) return;
        this._openModal({ type: "deleteButton", key, entity_id: sc.entity_id, alias: sc.alias, refs: null });
        this._api("GET", `buttons/${encodeURIComponent(key)}/references`).then((r) => {
          if (!s.modal || s.modal.key !== key) return;
          s.modal.refs = r.references;
          const box = this.shadowRoot.getElementById("refsBox");
          if (box) box.innerHTML = this._refsHtml(r.references);
        }).catch((err) => this._toast(err.message, "error"));
      },
      modalConfirmDelete: () => this._work(async () => {
        const m = s.modal;
        const r = await this._api("DELETE", `buttons/${encodeURIComponent(m.key)}`);
        this._closeModal();
        await this._loadButtons();
        await this._loadSignals();
        this._toast(`${m.entity_id} を削除しました` + (r.entity === "removed" ? "\nエンティティも削除しました。" : ""));
      }),
    };
    const fn = handlers[act];
    if (fn) fn();
  }
}

customElements.define("remo-ir-cloud-panel", RemoIrCloudPanel);
