// 前の名前のファイル（2026-11-25 ごろ消す）。新しいファイル（js/count.js・js/link.js・js/card.js・js/calendar.js）を読むだけ
// 前の index.html・create.html を覚えているブラウザ（LINE の中など）でも開けるように
// 読まれるところ：前の index.html・create.html（前の名前のファイル）
["js/count.js", "js/link.js", "js/card.js", "js/calendar.js"].forEach(function (src) {
  document.write('<script src="' + src + '"><\/script>');
});
