// 記念日・カウントダウンの共通処理（index.html と create.html で使う）
// URL のパラメータから「何の日か」を読み、いまの時刻での残り・経過を計算する。
(function () {
  "use strict";

  // おくるん（お知らせカード）。パラメータを渡すと、その内容のカードを LINE で送れる
  const OQRN_CARD = "https://liff.line.me/2009927876-DioOJd0z/card/";
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

  // "2026-12-24" または "2026-12-24T19:00" を端末の時刻として読む
  function parseDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(String(value || "").trim());
    if (!m) return null;
    const date = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    if (date.getMonth() !== +m[2] - 1) return null; // 2月30日など
    return { date, hasTime: m[4] != null };
  }

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

  // ○年○か月○日（start から end まで）
  function ymd(start, end) {
    let y = end.getFullYear() - start.getFullYear();
    let m = end.getMonth() - start.getMonth();
    let d = end.getDate() - start.getDate();
    if (d < 0) {
      m -= 1;
      d += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    }
    if (m < 0) {
      y -= 1;
      m += 12;
    }
    return [y && `${y}年`, m && `${m}か月`, d && `${d}日`].filter(Boolean).join("") || "0日";
  }

  /** URL のパラメータを読む。日付がなければ null */
  function readParams(search) {
    const q = new URLSearchParams(search);
    const parsed = parseDate(q.get("date"));
    if (!parsed) return null;
    let type = q.get("type");
    if (!TYPES[type]) type = parsed.date > new Date() ? "until" : "since";
    const color = COLORS.find((c) => c.key === q.get("color"))?.hex
      || (/^#?[0-9a-f]{6}$/i.test(q.get("color") || "") ? `#${q.get("color").replace("#", "")}` : COLORS[0].hex);
    return {
      type,
      date: parsed.date,
      hasTime: parsed.hasTime,
      dateText: q.get("date"),
      title: (q.get("title") || "").trim() || defaultTitle(type),
      emoji: (q.get("emoji") || "").trim() || TYPES[type].emoji,
      color,
      colorParam: q.get("color") || "",
      from: (q.get("from") || "").trim(),
      msg: (q.get("msg") || "").trim()
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
      const count = next.getFullYear() - p.date.getFullYear();
      const nth = count > 0 ? `${count}回目の` : "";
      const since = p.date <= now ? `${fmtDate(p.date)}から ${dayDiff(p.date, now) + 1}日目` : "";
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
  function buildShareUrl(base, values) {
    const q = new URLSearchParams();
    for (const key of ["type", "date", "title", "emoji", "color", "from", "msg"]) {
      const value = String(values[key] ?? "").trim();
      if (value) q.set(key, value);
    }
    return `${base}?${q}`;
  }

  /**
   * おくるんのお知らせカードで送るリンク。カウントダウン（その日まで・毎年の記念日）とカウントアップ（その日から）で見せ方を変える。
   *   カウントダウン … ⏳ 見出し「カウントダウン」、日付の下に「あと○日」のバッジ。当日は「今日は○○！」
   *   カウントアップ … 📈 見出し「カウントアップ」、「○日目」と「○年○か月○日」のバッジ。節目の日はお祝いの言葉
   * 日数は送ったあとに変わるので、送った日の時点だとわかるように書き、最新はボタンの先（このページ）で見てもらう。
   */
  function buildCardUrl(p, shareUrl, now = new Date()) {
    const v = compute(p, now);
    const up = p.type === "since" && p.date <= now;
    const stamp = `🕒 ${now.getMonth() + 1}/${now.getDate()} 時点`;
    let title;
    let date;
    const badges = [];
    if (p.type === "yearly") {
      const nth = v.nth > 0 ? `${v.nth}回目の` : "";
      title = v.today ? `🎉 今日は ${nth}${p.title}！` : `${p.emoji} ${nth}${p.title}まで`;
      date = `毎年 ${p.date.getMonth() + 1}月${p.date.getDate()}日`;
    } else if (up) {
      title = v.celebrate ? `🎉 ${p.title}から ${v.days.toLocaleString()}日目！` : `${p.emoji} ${p.title}から`;
      date = `${fmtDate(p.date, false)}から`;
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
    const detail = [p.msg, p.from ? `from ${p.from}` : "", stamp].filter(Boolean).join("\n");
    const q = new URLSearchParams({
      headerTitle: up ? "📈 カウントアップ" : p.type === "yearly" ? "🎂 記念日カウントダウン" : "⏳ カウントダウン",
      date,
      title,
      detail,
      showDate: "true",
      theme: "custom",
      customColor: p.color,
      bubbleSize: "mega",
      showAction: "true",
      // 当日は残りがないので、お祝いのページ（紙吹雪）を開いてもらう
      actionLabel: v.today ? "🎉 お祝いページを開く" : up ? "📈 今日で何日目？" : "⏳ 最新の残りを見る",
      actionUrl: shareUrl
    });
    for (const badge of badges) q.append("badge", badge);
    return `${OQRN_CARD}?${q}`;
  }

  window.Countdown = { TYPES, COLORS, LINE_URI_MAX, parseDate, readParams, compute, parts, fmtDate, pad, buildShareUrl, buildCardUrl };
})();
