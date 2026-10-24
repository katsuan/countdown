// 記念日・カウントダウンの共通処理（index.html と create.html で使う）
// URL のパラメータから「何の日か」を読み、いまの時刻での残り・経過を計算する。
(function () {
  "use strict";

  // おくるん（お知らせカード）。パラメータを渡すと、その内容のカードを LINE で送れる
  const LINE_URI_MAX = 1000; // LINE のリンクの長さの上限

  // 種類。until＝その日まで / yearly＝毎年の記念日 / since＝その日から
  const TYPES = {
    until: { label: "その日まで", emoji: "⏳", hint: "旅行・イベント・締め切りなど" },
    yearly: { label: "毎年の記念日", emoji: "🎂", hint: "誕生日・結婚記念日など" },
    since: { label: "その日から", emoji: "💞", hint: "付き合った日・禁煙・入社など" }
  };

  // 色（おくるんと同じ並び。先頭はおくるんの紫）
  const COLORS = [
    { key: "purple", label: "むらさき", hex: "#6c47ff" },
    { key: "sky", label: "そら", hex: "#2f8fe0" },
    { key: "leaf", label: "みどり", hex: "#22a86a" },
    { key: "sunset", label: "ゆうやけ", hex: "#f2711c" },
    { key: "berry", label: "ベリー", hex: "#e0457b" }
  ];

  // 「その日から」で節目にする日数（○日目）
  const MILESTONE_DAYS = [100, 200, 300, 365, 500, 700, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7000, 10000];

  const DAY = 864e5;
  const WEEK = "日月火水木金土";
  const pad = (n) => String(n).padStart(2, "0");

  // "2026-12-24" または "2026-12-24T19:00" を端末の時刻として読む。
  // 毎年の記念日は "11-03" のように年なしでもよい（年齢や「○回目」を出したくないとき。noYear）
  function parseDate(value) {
    const text = String(value || "").trim();
    const md = /^(\d{2})-(\d{2})$/.exec(text);
    if (md) {
      // 2月29日も入れられるよう、うるう年（2000年）の日付として持つ
      const date = new Date(2000, +md[1] - 1, +md[2]);
      if (date.getMonth() !== +md[1] - 1) return null;
      return { date, hasTime: false, noYear: true };
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(text);
    if (!m) return null;
    const date = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    if (date.getMonth() !== +m[2] - 1) return null; // 2月30日など
    return { date, hasTime: m[4] != null, noYear: false };
  }

  // ボードの行は幅が狭いので「2015/6/20(土)」の短い形にする
  const shortDate = (d, hasTime) =>
    `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})${hasTime ? ` ${d.getHours()}:${pad(d.getMinutes())}` : ""}`;
  const monthDay = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

  function fmtDate(d, hasTime) {
    const text = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WEEK[d.getDay()]})`;
    return hasTime ? `${text} ${d.getHours()}:${pad(d.getMinutes())}` : text;
  }

  // その年の記念日（2月29日は、うるう年でない年は2月28日）
  function inYear(base, year) {
    const last = new Date(year, base.getMonth() + 1, 0).getDate();
    return new Date(year, base.getMonth(), Math.min(base.getDate(), last), base.getHours(), base.getMinutes());
  }

  // n か月あとの日（31日の「1か月」は、その月の終わりの日。inYear と同じ考え方）
  function addMonths(d, n) {
    const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
    return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last));
  }

  // ○年○か月○日（start から end まで）。いちばん近い「○か月の日」から何日たったか
  function ymd(start, end) {
    const s = startOfDay(start), e = startOfDay(end);
    let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    if (addMonths(s, months) > e) months -= 1;
    const y = Math.floor(months / 12), m = months % 12, d = dayDiff(addMonths(s, months), e);
    return [y && `${y}年`, m && `${m}か月`, d && `${d}日`].filter(Boolean).join("") || "0日";
  }

  // URL で受けとる文字の長さ（作る画面の上限より少し長め。古いリンクも読めるように）
  const LIMITS = { title: 60, emoji: 16, from: 40, msg: 300, name: 40 };
  const Z_MAX = 6000; // ?z= の長さの上限（12件まで入れても 2000 字ほど）
  const cut = (text, max) => Array.from(String(text || "").trim()).slice(0, max).join("");

  /** URL のパラメータを読む。日付がなければ null */
  function readParams(search) {
    const q = new URLSearchParams(expandSearch(search));
    const parsed = parseDate(q.get("date"));
    if (!parsed) return null;
    let type = q.get("type");
    if (!TYPES[type]) type = parsed.date > new Date() ? "until" : "since";
    if (parsed.noYear) type = "yearly";
    const color = COLORS.find((c) => c.key === q.get("color"))?.hex
      || (/^#?[0-9a-f]{6}$/i.test(q.get("color") || "") ? `#${q.get("color").replace("#", "")}` : COLORS[0].hex);
    return {
      type,
      date: parsed.date,
      hasTime: parsed.hasTime,
      noYear: parsed.noYear,
      dateText: q.get("date"),
      title: cut(q.get("title"), LIMITS.title) || defaultTitle(type),
      note: cut(q.get("note"), NOTE_MAX),
      emoji: cut(q.get("emoji"), LIMITS.emoji) || TYPES[type].emoji,
      color,
      colorParam: q.get("color") || "",
      from: cut(q.get("from"), LIMITS.from),
      msg: cut(q.get("msg"), LIMITS.msg)
    };
  }

  function defaultTitle(type) {
    return { until: "その日", yearly: "記念日", since: "はじまりの日" }[type];
  }

  /**
   * いまの時刻での表示内容。
   * target … 数える先の日時（その日まで・毎年の記念日）
   * days / unit … 大きく出す数字とその前後の言葉
   */
  function compute(p, now = new Date()) {
    if (p.type === "until") {
      const isToday = dayDiff(now, p.date) === 0;
      const passed = p.date <= now;
      if (passed && !isToday) {
        const days = dayDiff(p.date, now);
        return { lead: `${p.title}から`, days, unit: "日たちました", target: null, celebrate: false, sub: fmtDate(p.date, p.hasTime) };
      }
      if (passed || (isToday && !p.hasTime)) {
        return { lead: "", days: null, today: `今日は ${p.title}！`, target: null, celebrate: true, sub: fmtDate(p.date, p.hasTime) };
      }
      // 当日で時刻がまだのときは「あと0日」ではなく、時・分・秒だけで数える
      if (isToday) return { lead: "", days: null, today: `今日は ${p.title}！`, target: p.date, celebrate: false, sub: fmtDate(p.date, p.hasTime) };
      return { lead: `${p.title}まで`, prefix: "あと", days: dayDiff(now, p.date), unit: "日", target: p.date, celebrate: false, sub: fmtDate(p.date, p.hasTime) };
    }

    if (p.type === "yearly") {
      const year = now.getFullYear();
      let next = inYear(p.date, year);
      const today = dayDiff(now, next) === 0;
      if (!today && next < now) next = inYear(p.date, year + 1);
      // 年なしのときは「○回目」「○日目」を出さない
      const count = p.noYear ? 0 : next.getFullYear() - p.date.getFullYear();
      const nth = count > 0 ? `${count}回目の` : "";
      const since = !p.noYear && p.date <= now ? `${fmtDate(p.date)}から ${dayDiff(p.date, now) + 1}日目` : "";
      if (today) {
        return { lead: "", days: null, today: `今日は ${nth}${p.title}！`, target: null, celebrate: true, sub: since, nth: count };
      }
      return {
        lead: `${nth}${p.title}まで`,
        prefix: "あと",
        days: dayDiff(now, next),
        unit: "日",
        target: next,
        celebrate: false,
        sub: `${fmtDate(next)}${since ? `\n${since}` : ""}`,
        nth: count
      };
    }

    // since：はじまりの日を1日目として数える
    if (p.date > now) {
      return { lead: `${p.title}まで`, prefix: "あと", days: dayDiff(now, p.date), unit: "日", target: p.date, celebrate: false, sub: fmtDate(p.date, p.hasTime) };
    }
    const nthDay = dayDiff(p.date, now) + 1;
    const milestone = nextMilestone(p.date, now);
    const isMilestone = MILESTONE_DAYS.includes(nthDay) || (dayDiff(inYear(p.date, now.getFullYear()), now) === 0 && nthDay > 1);
    return {
      lead: `${p.title}から`,
      prefix: "今日で",
      days: nthDay,
      unit: "日目",
      target: null,
      celebrate: isMilestone,
      sub: `${fmtDate(p.date, false)}から ${ymd(p.date, now)}`,
      milestone
    };
  }

  // 次の節目（○日目・○周年のうち近いほう）
  function nextMilestone(start, now) {
    const nthDay = dayDiff(start, now) + 1;
    const candidates = [];
    const dayMark = MILESTONE_DAYS.find((n) => n > nthDay);
    if (dayMark) candidates.push({ label: `${dayMark}日目`, date: new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayMark - 1) });
    let year = now.getFullYear();
    let anniv = inYear(start, year);
    if (dayDiff(now, anniv) <= 0) anniv = inYear(start, ++year);
    candidates.push({ label: `${year - start.getFullYear()}周年`, date: anniv });
    candidates.sort((a, b) => a.date - b.date);
    const pick = candidates[0];
    return { label: pick.label, date: pick.date, daysLeft: dayDiff(now, pick.date), dateText: fmtDate(pick.date) };
  }

  // 残りを 日・時間・分・秒 に分ける
  function parts(target, now = Date.now()) {
    let ms = Math.max(0, target - now);
    const d = Math.floor(ms / DAY);
    ms -= d * DAY;
    const h = Math.floor(ms / 36e5);
    ms -= h * 36e5;
    const m = Math.floor(ms / 6e4);
    ms -= m * 6e4;
    return { d, h, m, s: Math.floor(ms / 1e3), done: target - now <= 0 };
  }

  /** 共有用の URL（入力したものだけをパラメータにする） */
  // 共有用の URL は短い形（?z=）で作る。読むときは expandSearch で元の形に戻す
  function buildShareUrl(base, values) {
    return `${base}?z=${packZ({ name: "", from: values.from, msg: values.msg, entries: [values] })}`;
  }

  /**
   * おくるんのお知らせカードで送るリンク。カウントダウン（その日まで・毎年の記念日）とカウントアップ（その日から）で見せ方を変える。
   *   カウントダウン … ⏳ 見出し「カウントダウン」、日付の下に「あと○日」のバッジ。当日は「今日は○○！」
   *   カウントアップ … 📈 見出し「カウントアップ」、「○日目」と「○年○か月○日」のバッジ。節目の日はお祝いの言葉
   *   その日まで（過ぎたあと） … ページと同じくカウントアップに切り替える。📈 見出し「カウントアップ」、「○日たちました」のバッジ
   * 日数は送ったあとに変わるので、送った日の時点だとわかるように書き、最新はボタンの先（このページ）で見てもらう。
   */
  function buildCardUrl(p, shareUrl, now = new Date()) {
    const v = compute(p, now);
    const up = p.type === "since" && p.date <= now;
    // その日まで：日を過ぎたあと（当日を除く）は、ページと同じく「○日たちました」のカウントアップにする
    const after = p.type === "until" && !v.today && v.prefix !== "あと" && v.days != null;
    const stamp = `🕒 ${now.getMonth() + 1}/${now.getDate()} 時点`;
    let title;
    let date;
    const badges = [];
    if (p.type === "yearly") {
      const nth = v.nth > 0 ? `${v.nth}回目の` : "";
      title = v.today ? `🎉 今日は ${nth}${p.title}！` : `${p.emoji} ${nth}${p.title}まで`;
      date = `毎年 ${monthDay(p.date)}`;
    } else if (up) {
      title = v.celebrate ? `🎉 ${p.title}から ${v.days.toLocaleString()}日目！` : `${p.emoji} ${p.title}から`;
      date = `${fmtDate(p.date, false)}から`;
    } else if (after) {
      title = `${p.emoji} ${p.title}から`;
      date = `${fmtDate(p.date, p.hasTime)}から`;
    } else {
      title = v.today ? `🎉 今日は ${p.title}！` : `${p.emoji} ${p.title}まで`;
      date = fmtDate(p.date, p.hasTime);
    }
    if (up) {
      badges.push(`${v.days.toLocaleString()}日目`);
      const span = (v.sub || "").split(" ").pop();
      if (span && span !== "0日") badges.push(span);
    } else if (v.today) {
      badges.push("今日！");
    } else if (v.days != null) {
      badges.push(v.prefix === "あと" ? `あと${v.days.toLocaleString()}日` : `${v.days.toLocaleString()}${v.unit}`);
    }
    const detail = [p.note, p.msg, p.from ? `from ${p.from}` : "", stamp].filter(Boolean).join("\n");
    const q = new URLSearchParams({
      headerTitle: up || after ? "📈 カウントアップ" : p.type === "yearly" ? "🎂 記念日カウントダウン" : "⏳ カウントダウン",
      date,
      title,
      detail,
      showDate: "true",
      theme: "custom",
      customColor: p.color,
      bubbleSize: "mega",
      showAction: "true",
      // 当日は残りがないので、お祝いのページ（紙吹雪）を開いてもらう
      actionLabel: v.today ? "🎉 お祝いページを開く" : up ? "📈 今日で何日目？" : after ? "📈 何日たった？" : "⏳ 最新の残りを見る",
      actionUrl: shareUrl
    });
    for (const badge of badges) q.append("badge", badge);
    q.set("from", "countdown"); // おくるん側で、記念日・カウントダウンから来たと数える（流入口）
    return okuruUrl(q);
  }

  // おくるんのカードの URL。部品（oqrn.js）が読めない（電波なしなど）ときは、送るボタンだけ使えない
  const okuruUrl = (q) => (window.OQRN ? window.OQRN.cardUrl(q) : "#");

  // ---- Google カレンダーに追加 ----
  const ymdText = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const timeText = (d) => `${ymdText(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

  /** Google カレンダーの予定作成画面のリンク。時刻なしは終日、時刻ありは1時間。yearly で毎年くり返す */
  function calendarUrl({ title, date, hasTime = false, yearly = false, details = "" }) {
    const end = hasTime ? new Date(date.getTime() + 36e5) : new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    const q = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates: hasTime ? `${timeText(date)}/${timeText(end)}` : `${ymdText(date)}/${ymdText(end)}`,
      details
    });
    if (hasTime) q.set("ctz", Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo");
    if (yearly) q.set("recur", "RRULE:FREQ=YEARLY");
    return `https://calendar.google.com/calendar/render?${q}`;
  }

  /**
   * カレンダーのファイル（.ics）。スマホの Google カレンダーのアプリで開くと、リンクの「毎年くり返し」（recur）が
   * 外れて1回だけの予定になることがあるので、くり返しを確実に入れたいときはこちら（iPhone・Android のカレンダーで開ける）
   */
  function icsText({ title, date, hasTime = false, yearly = false, details = "" }) {
    const esc = (t) => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n|\r/g, "\\n");
    const end = hasTime ? new Date(date.getTime() + 36e5) : new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//katsuan//countdown//JA",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@katsuan.github.io`,
      `DTSTAMP:${stamp}`,
      hasTime ? `DTSTART:${timeText(date)}` : `DTSTART;VALUE=DATE:${ymdText(date)}`,
      hasTime ? `DTEND:${timeText(end)}` : `DTEND;VALUE=DATE:${ymdText(end)}`,
      ...(yearly ? ["RRULE:FREQ=YEARLY"] : []),
      `SUMMARY:${esc(title)}`,
      ...(details ? [`DESCRIPTION:${esc(details)}`] : []),
      "END:VEVENT",
      "END:VCALENDAR",
      ""
    ].join("\r\n");
  }

  /**
   * その日の種類に合わせたカレンダーのボタン（該当日・次の記念日への導線）。
   * label はボタンの1行目（短く）、sub は2行目（日付など）。スマホの幅で変なところで折り返さないように分ける
   *   その日まで … その日（時刻があればその時刻）
   *   毎年の記念日 … 次の日を毎年くり返す予定で
   *   その日から … 次の節目（100日目・1000日目など）と、毎年の○周年
   */
  function calendarLinks(p, pageUrl, now = new Date()) {
    // event はカレンダーのファイル（icsText）用に同じ中身を持っておく
    const ev = (spec) => ({ url: calendarUrl(spec), event: spec });
    const details = [p.note, pageUrl].filter(Boolean).join("\n");
    const label = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    if (p.type === "yearly") {
      let next = inYear(p.date, now.getFullYear());
      if (dayDiff(now, next) < 0) next = inYear(p.date, now.getFullYear() + 1);
      return [{ label: "🗓️ 毎年の予定として追加", sub: `次は ${label(next)}・Googleカレンダー`, ...ev({ title: `${p.emoji} ${p.title}`, date: next, yearly: true, details }) }];
    }
    if (p.type === "since" && p.date <= now) {
      const links = [];
      // 次の「○日目」の節目（周年のほうが近くても出す）
      const nthDay = dayDiff(p.date, now) + 1;
      const dayMark = MILESTONE_DAYS.find((n) => n > nthDay);
      if (dayMark) {
        const date = new Date(p.date.getFullYear(), p.date.getMonth(), p.date.getDate() + dayMark - 1);
        links.push({ label: `🗓️ ${dayMark.toLocaleString()}日目を追加`, sub: `${date.getFullYear()}/${label(date)}・Googleカレンダー`, ...ev({ title: `${p.emoji} ${p.title}から${dayMark.toLocaleString()}日目`, date, details }) });
      }
      let anniv = inYear(p.date, now.getFullYear());
      if (dayDiff(now, anniv) <= 0) anniv = inYear(p.date, now.getFullYear() + 1);
      links.push({ label: "🗓️ 毎年の記念日を追加", sub: `次は ${label(anniv)}・Googleカレンダー`, ...ev({ title: `${p.emoji} ${p.title}の記念日`, date: anniv, yearly: true, details }) });
      return links;
    }
    if (dayDiff(now, p.date) < 0) return [];
    const when = `${p.date.getFullYear()}/${label(p.date)}${p.hasTime ? ` ${p.date.getHours()}:${pad(p.date.getMinutes())}` : ""}`;
    return [{ label: "🗓️ カレンダーに追加", sub: `${when}・Googleカレンダー`, ...ev({ title: `${p.emoji} ${p.title}`, date: p.date, hasTime: p.hasTime, details }) }];
  }

  // ---- ボード（いくつかの日をまとめて表示） ----
  // ?name=ボードの名前&e=種類~日付~名前~絵文字~色&e=…（from・msg はボード全体に1つ）
  const SEP = "~";
  const MAX_ENTRIES = 12;
  const ENTRY_KEYS = ["type", "date", "title", "emoji", "color", "note"];
  // 日ごとのひとこと。ボードの行で、名前と日数の下に1行で収まる長さ（幅 320px のスマホで全角16文字ほど）
  const NOTE_MAX = 15;

  function encodeEntry(values) {
    return ENTRY_KEYS.map((key) => String(values[key] ?? "").replaceAll(SEP, "").trim()).join(SEP);
  }

  // 1件分を単体のページのパラメータに直す（readParams にそのまま渡せる）
  function entrySearch(text) {
    const q = new URLSearchParams();
    String(text).split(SEP).forEach((value, i) => {
      if (ENTRY_KEYS[i] && value) q.set(ENTRY_KEYS[i], value);
    });
    return `?${q}`;
  }

  /** ボードを読む。e が2つ以上あるときだけボード（1つなら単体のページとして扱う） */
  function readBoard(search) {
    const q = new URLSearchParams(expandSearch(search));
    const entries = q.getAll("e").slice(0, MAX_ENTRIES)
      .map((text) => ({ search: entrySearch(text), p: readParams(entrySearch(text)) }))
      .filter((entry) => entry.p);
    if (entries.length < 2) return null;
    return {
      name: cut(q.get("name"), LIMITS.name) || "記念日ボード",
      from: cut(q.get("from"), LIMITS.from),
      msg: cut(q.get("msg"), LIMITS.msg),
      entries
    };
  }

  /** ボードの1行分。近い順に並べるための sortKey（ミリ秒）と、右に大きく出す数字 */
  function rowView(p, now = new Date()) {
    const v = compute(p, now);
    let count;
    let sortKey;
    if (v.today) {
      count = "今日！";
      sortKey = 0;
    } else if (v.prefix === "あと") {
      count = `あと${v.days.toLocaleString()}日`;
      sortKey = v.target - now;
    } else if (p.type === "since") {
      count = `${v.days.toLocaleString()}日目`;
      // 次の節目（○日目・○周年）が近いものほど上に
      sortKey = v.milestone ? v.milestone.date - now : Infinity;
    } else {
      count = `${v.days.toLocaleString()}日前`;
      sortKey = Infinity;
    }
    const sub = p.type === "yearly"
      ? `毎年 ${monthDay(p.date)}${v.nth > 0 ? `・${v.nth}回目` : ""}`
      : p.type === "since" && p.date <= now
        ? `${shortDate(p.date)}から`
        : shortDate(p.date, p.hasTime);
    return { v, count, sortKey, sub, celebrate: v.celebrate };
  }

  function sortedRows(board, now = new Date()) {
    return board.entries
      .map((entry) => ({ ...entry, ...rowView(entry.p, now) }))
      .sort((a, b) => a.sortKey - b.sortKey);
  }

  function buildBoardUrl(base, board) {
    return `${base}?z=${packZ(board)}`;
  }

  // ---- 短い URL（?z=） ----
  // 日本語は URL に入れると1文字9文字（%E3%81%8A…）になるので、中身をまとめて UTF-8 → base64url にする（1文字およそ4文字）。
  // 中身：[ボードの名前, 送る人, ひとこと] と、1件ごとの [種類, 日付, 名前, 絵文字, 色]。
  //   区切りは 項目＝\x1f・行＝\x1e。種類は u/y/s、色は 0〜4（むらさきは空）、日付は数字だけ（20261224・202612241900・1103）。
  //   絵文字は種類の決まりの絵文字なら空。後ろの空の項目は省く
  // 1件ならその日のページ、2件以上ならボード。z がないときは今までのパラメータ（type・date…／e=…）をそのまま読む
  const TYPE_CODES = { until: "u", yearly: "y", since: "s" };
  const FS = "\x1f";
  const RS = "\x1e";

  const trimEnd = (fields) => {
    const out = fields.map((v) => String(v ?? "").replaceAll(FS, " ").replaceAll(RS, " ").trim());
    while (out.length && !out[out.length - 1]) out.pop();
    return out.join(FS);
  };

  function packDate(text) {
    return String(text || "").replace(/[-T:]/g, "");
  }

  function unpackDate(text) {
    const d = String(text || "");
    if (d.length === 4) return `${d.slice(0, 2)}-${d.slice(2)}`;
    const ymd = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    return d.length === 12 ? `${ymd}T${d.slice(8, 10)}:${d.slice(10, 12)}` : ymd;
  }

  function packZ({ name, from, msg, entries }) {
    const rows = [trimEnd([name, from, msg])];
    for (const e of entries) {
      const type = TYPES[e.type] ? e.type : "";
      const colorIndex = COLORS.findIndex((c) => c.key === e.color);
      rows.push(trimEnd([
        TYPE_CODES[type] || "",
        packDate(e.date),
        e.title,
        type && e.emoji === TYPES[type].emoji ? "" : e.emoji,
        colorIndex > 0 ? String(colorIndex) : colorIndex === 0 ? "" : e.color,
        e.note
      ]));
    }
    const bytes = new TextEncoder().encode(rows.join(RS));
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function unpackZ(z) {
    if (typeof z !== "string" || z.length > Z_MAX || !/^[A-Za-z0-9_-]+$/.test(z)) return null;
    try {
      const binary = atob(String(z).replace(/-/g, "+").replace(/_/g, "/"));
      const text = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
      const [head, ...rows] = text.split(RS);
      const [name = "", from = "", msg = ""] = head.split(FS);
      const typeOf = Object.fromEntries(Object.entries(TYPE_CODES).map(([k, v]) => [v, k]));
      const entries = rows.slice(0, MAX_ENTRIES).map((row) => {
        const [t = "", d = "", title = "", emoji = "", c = "", note = ""] = row.split(FS);
        return {
          type: typeOf[t] || "",
          date: unpackDate(d),
          title,
          emoji,
          color: /^\d$/.test(c) ? COLORS[+c]?.key || "" : c || COLORS[0].key,
          note
        };
      });
      return { name, from, msg, entries };
    } catch {
      return null;
    }
  }

  /** ?z= を今までのパラメータの形に戻す（1件なら type・date…、2件以上なら name・e=…）。z がなければそのまま */
  function expandSearch(search) {
    const q = new URLSearchParams(search);
    const z = q.get("z");
    if (!z) return q.toString();
    const data = unpackZ(z);
    if (!data || !data.entries.length) return "";
    const out = new URLSearchParams();
    if (data.entries.length === 1) {
      for (const [key, value] of Object.entries(data.entries[0])) if (value) out.set(key, value);
    } else {
      if (data.name) out.set("name", data.name);
      for (const entry of data.entries) out.append("e", encodeEntry(entry));
    }
    if (data.from) out.set("from", data.from);
    if (data.msg) out.set("msg", data.msg);
    return out.toString();
  }

  /** 今のページの URL を短い形に直す（古い長いリンクで開いたときも、共有するのは短い形） */
  function shortUrl(href) {
    const url = new URL(href);
    const base = `${url.origin}${url.pathname}`;
    const q = new URLSearchParams(expandSearch(url.search));
    const from = q.get("from") || "";
    const msg = q.get("msg") || "";
    if (q.getAll("e").length >= 2) {
      const entries = q.getAll("e").map((text) => Object.fromEntries(new URLSearchParams(entrySearch(text))));
      return buildBoardUrl(base, { name: q.get("name") || "", from, msg, entries });
    }
    return q.get("date") ? buildShareUrl(base, Object.fromEntries(q)) : href;
  }

  /** ボードをおくるんのカードで送るリンク。近い順に1行ずつ「絵文字 名前　あと○日」を並べる */
  function buildBoardCardUrl(board, shareUrl, now = new Date()) {
    // 日数を先に置く（名前が長くても日数が途中で折り返されないように）
    const lines = sortedRows(board, now).map((row) => `${row.count}｜${row.p.emoji} ${row.p.title}`);
    const detail = [lines.join("\n"), board.msg, board.from ? `from ${board.from}` : ""].filter(Boolean).join("\n\n");
    const q = new URLSearchParams({
      headerTitle: "📋 記念日ボード",
      date: `🕒 ${now.getMonth() + 1}/${now.getDate()} 時点`,
      title: board.name,
      detail,
      showDate: "true",
      theme: "custom",
      customColor: COLORS[0].hex,
      bubbleSize: "mega",
      showAction: "true",
      actionLabel: "📋 ボードを開く",
      actionUrl: shareUrl
    });
    q.set("from", "countdown"); // おくるん側で、記念日・カウントダウンから来たと数える（流入口）
    return okuruUrl(q);
  }

  // ---- すくすく（SuQSuQ）へのリンク ----
  // 日付を渡して、すくすくで写真・動画に入れる。リンクの形（?birth=・?due=・?since=&title=・&name=）はすくすくと同じ
  //   赤ちゃん・子どもの生まれた日（7年以内）→「生まれて◯日」（birth）、出産予定日 →「妊娠◯週」（due）
  //   そのほかのはじまりの日（付き合った日・結婚記念日など）→「◯◯から◯日目」（since）
  //   すくすくから作ったページ（「はるとの誕生日」「ひなに会える日」など）なら、名前も返す
  const SUQSUQ_URL = "https://katsuan.github.io/suqsuq/";
  const KID_TITLE = /^(.{1,16}?)(?:の(?:誕生日|生後\d+か月|生まれて\d+日|お七夜|お食い初め|お宮参りのころ|ハーフバースデー|\d+さいの誕生日)|に会える日)$/u;
  const BABY_WORDS = /出産|予定日|赤ちゃん|ベビー|誕生|生まれ|お食い初め|お七夜|ハーフバースデー|👶|🍼|🤰/;
  const SUQSUQ_SUBS = {
    birth: "生まれて◯日目を写真・動画に（SuQSuQ）",
    due: "「妊娠◯週」を写真・動画に（SuQSuQ）",
    since: "この日から◯日目を写真・動画に（SuQSuQ）"
  };

  /** すくすくへのリンク { kind, url, sub }。出さないときは null */
  function suqsuqLink(p, now = new Date()) {
    const day = `${p.date.getFullYear()}-${pad(p.date.getMonth() + 1)}-${pad(p.date.getDate())}`;
    const past = !p.noYear && p.date <= now;
    const kid = (p.title || "").match(KID_TITLE);
    const baby = Boolean(kid) || BABY_WORDS.test(`${p.title} ${p.emoji}`);
    const young = past && now - p.date < 7 * 365.25 * DAY;
    const startDay = p.type === "since" || p.type === "yearly";
    let kind = null;
    if (baby && young && startDay) kind = "birth";
    else if (past && startDay) kind = "since";
    else if (baby && !past && p.type === "until") kind = "due";
    if (!kind) return null;
    const q = new URLSearchParams({ [kind]: day });
    // 名前は16文字まで（絵文字を半分に切らないよう、文字で数える）
    if (kind === "since") q.set("title", cut(p.title, 16));
    else if (kid && kid[1] !== "赤ちゃん") q.set("name", kid[1]);
    return { kind, url: `${SUQSUQ_URL}?${q}`, sub: SUQSUQ_SUBS[kind] };
  }

  window.Countdown = {
    TYPES, COLORS, LINE_URI_MAX, MAX_ENTRIES, NOTE_MAX, parseDate, monthDay, readParams, compute, parts, fmtDate, pad,
    buildShareUrl, buildCardUrl, readBoard, sortedRows, buildBoardUrl, buildBoardCardUrl, expandSearch, shortUrl, calendarLinks, icsText,
    suqsuqLink
  };
})();
