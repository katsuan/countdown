// くろのす：URL の中身（?date=・?z=・e=）を読む・カレンダーのファイルのテスト（画面に触らない部分）
//   node --test test/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const XSS = "<img src=x onerror=alert(1)>";
const ctx = { window: {}, URLSearchParams, URL, TextEncoder, TextDecoder, atob, btoa, Intl, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../common.js"), "utf8"), ctx);
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
