// くろのす：URL の中身（?date=・?z=・e=）を読む・カレンダーのファイルのテスト（画面に触らない部分）
//   node --test test/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const XSS = "<img src=x onerror=alert(1)>"; // qcheck-ok: W8 外からの文字の見本
const ctx = { window: {}, URLSearchParams, URL, TextEncoder, TextDecoder, atob, btoa, Intl, console };
vm.createContext(ctx);
for (const f of ["count", "link", "card", "calendar"]) vm.runInContext(fs.readFileSync(path.join(__dirname, `../js/${f}.js`), "utf8"), ctx);
const C = ctx.window.Countdown;
const b64 = (text) => Buffer.from(text, "utf8").toString("base64url");

test("ふつうのリンクを読む", () => {
  const p = C.readParams("?type=until&date=2030-12-24&title=" + encodeURIComponent("沖縄旅行") + "&color=sky");
  assert.equal(p.type, "until");
  assert.equal(p.title, "沖縄旅行");
  assert.equal(p.color, "#2f8fe0");
});

test("日付がない・壊れた日付は読まない", () => {
  assert.equal(C.readParams(""), null);
  assert.equal(C.readParams("?date=" + encodeURIComponent(XSS)), null);
  assert.equal(C.readParams("?date=2030-02-30"), null);
});

test("名前などの HTML は、文字のまま残る（画面は textContent で出す）。長さには上限", () => {
  const long = "あ".repeat(1000);
  const p = C.readParams(`?date=2030-01-01&title=${encodeURIComponent(XSS)}&emoji=${encodeURIComponent(long)}&msg=${encodeURIComponent(long)}&from=${encodeURIComponent(long)}&note=${encodeURIComponent(long)}`);
  assert.equal(p.title, XSS);
  assert.equal(Array.from(p.emoji).length, 16);
  assert.equal(p.msg.length, 300);
  assert.equal(p.from.length, 40);
  assert.equal(p.note.length, 15);
});

test("色は決まった色か #rrggbb だけ（CSS に入るので）", () => {
  assert.equal(C.readParams("?date=2030-01-01&color=" + encodeURIComponent("red;background:url(x)")).color, "#6c47ff");
  assert.equal(C.readParams("?date=2030-01-01&color=ff0000").color, "#ff0000");
});

test("短い形（?z=）：作って読むと同じ中身。ボードは2件から", () => {
  const board = { name: "わが家", from: "", msg: "", entries: [
    { type: "yearly", date: "2015-06-20", title: "結婚記念日", emoji: "💍", color: "berry", note: "" },
    { type: "until", date: "2030-12-24T19:00", title: XSS, emoji: "", color: "purple", note: "" }
  ] };
  const url = C.buildBoardUrl("https://katsuan.github.io/countdown/", board);
  const read = C.readBoard(new URL(url).search);
  assert.equal(read.name, "わが家");
  assert.equal(read.entries.length, 2);
  assert.ok(read.entries.some((e) => e.p.title === XSS));
});

test("壊れた ?z=（base64 でない・長すぎる・中身がちがう）でも落ちない", () => {
  for (const z of ["%%%", "!!!", "a", "a".repeat(7000), b64("\x1e\x1e\x1e"), b64("\x1f".repeat(100)), b64(XSS)]) {
    assert.doesNotThrow(() => C.expandSearch("?z=" + encodeURIComponent(z)));
    assert.equal(C.readParams("?z=" + encodeURIComponent(z)), null, z.slice(0, 10));
    assert.equal(C.readBoard("?z=" + encodeURIComponent(z)), null);
  }
});

test("ボードの件数は 12 件まで", () => {
  const rows = Array.from({ length: 50 }, (_, i) => `u\x1f2030010${(i % 9) + 1}\x1fn${i}`);
  const board = C.readBoard("?z=" + b64(["名前", ...rows].join("\x1e")));
  assert.equal(board.entries.length, 12);
});

test("カレンダーのファイル：名前に改行やカンマが入っても行が崩れない", () => {
  const ics = C.icsText({ title: "a\r\nATTACH:x,;", date: new Date(2030, 0, 1), details: "b\rc" });
  const lines = ics.split("\r\n");
  assert.ok(lines.every((l) => !l.startsWith("ATTACH")));
  assert.ok(lines.includes(String.raw`SUMMARY:a\nATTACH:x\,\;`));
  assert.ok(lines.includes("DESCRIPTION:b\\nc"));
});

test("「その日から」の◯か月◯日：月の終わり・うるう日でもマイナスにならない", () => {
  const p = C.readParams("?type=since&date=2026-01-31&title=a");
  const span = (y, m, d) => C.compute(p, new Date(y, m - 1, d, 12)).sub.split(" ").pop();
  assert.equal(span(2026, 2, 27), "27日");
  assert.equal(span(2026, 2, 28), "1か月");
  assert.equal(span(2026, 3, 1), "1か月1日");
  assert.equal(span(2027, 1, 31), "1年");
  const leap = C.readParams("?type=since&date=2024-02-29&title=a");
  assert.equal(C.compute(leap, new Date(2025, 1, 28, 12)).sub.split(" ").pop(), "1年");
  assert.equal(C.compute(leap, new Date(2025, 2, 1, 12)).sub.split(" ").pop(), "1年1日");
});

test("おくるんの部品が読めない（電波なし）ときも、カードの URL で止まらない", () => {
  const p = C.readParams("?type=until&date=2030-12-24&title=a");
  assert.equal(C.buildCardUrl(p, "https://example.com/"), "#");
  const board = C.readBoard("?e=u~2030-12-24~a&e=s~2020-01-01~b");
  assert.equal(C.buildBoardCardUrl(board, "https://example.com/"), "#");
});

test("かぞく（KazoQ）のリンクの形を読む", () => {
  const due = C.readParams("?type=until&date=2027-03-01&title=" + encodeURIComponent("出産予定日") + "&emoji=" + encodeURIComponent("👶") + "&color=sunset");
  assert.equal(due.type, "until");
  assert.equal(due.title, "出産予定日");
  assert.equal(due.color, "#f2711c");
  const bd = C.readParams("?type=yearly&date=2026-07-14&title=" + encodeURIComponent("誕生日") + "&emoji=" + encodeURIComponent("🎂") + "&color=sunset");
  assert.equal(bd.type, "yearly");
  assert.equal(bd.noYear, false);
  assert.equal(C.compute(bd, new Date(2027, 6, 14, 9)).nth, 1);
});

test("すくすくへのリンク：生まれた日・出産予定日・そのほかの記念日（名前も返す）", () => {
  const now = new Date(2026, 9, 24, 12);
  const link = (search) => C.suqsuqLink(C.readParams(search), now);
  assert.equal(link("?type=yearly&date=2026-07-14&title=" + encodeURIComponent("はるとの誕生日")).url, "https://katsuan.github.io/suqsuq/?birth=2026-07-14&name=" + encodeURIComponent("はると"));
  assert.equal(link("?type=until&date=2027-03-01&title=" + encodeURIComponent("ひなに会える日")).url, "https://katsuan.github.io/suqsuq/?due=2027-03-01&name=" + encodeURIComponent("ひな"));
  assert.equal(link("?type=until&date=2027-03-01&title=" + encodeURIComponent("出産予定日")).kind, "due");
  assert.equal(link("?type=until&date=2027-03-01&title=" + encodeURIComponent("赤ちゃんに会える日")).url, "https://katsuan.github.io/suqsuq/?due=2027-03-01");
  const anniv = link("?type=since&date=2020-04-01&title=" + encodeURIComponent("付き合った日"));
  assert.equal(anniv.kind, "since");
  assert.equal(anniv.url, "https://katsuan.github.io/suqsuq/?since=2020-04-01&title=" + encodeURIComponent("付き合った日"));
  // 7年より前の「誕生日」は記念日として
  assert.equal(link("?type=yearly&date=2010-05-05&title=" + encodeURIComponent("たろうの誕生日")).kind, "since");
  // 先の日の記念日・年なしは出さない
  assert.equal(link("?type=until&date=2027-03-01&title=" + encodeURIComponent("旅行")), null);
  assert.equal(link("?type=yearly&date=11-03&title=" + encodeURIComponent("記念日")), null);
});

test("すくすくへのリンク：名前が16文字目で絵文字にかかっても止まらない（絵文字を半分に切らない）", () => {
  const now = new Date(2026, 9, 24, 12);
  const title = "あ".repeat(15) + "🎉おめでとう";
  const res = C.suqsuqLink(C.readParams("?type=since&date=2020-04-01&title=" + encodeURIComponent(title)), now);
  assert.equal(new URL(res.url).searchParams.get("title"), "あ".repeat(15) + "🎉");
});
