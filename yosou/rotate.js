/* 正解の偏りをならす回転処理。build.js と verify.js が同じものを使う（ずれ防止）。 */
const CIRCLE = "①②③④⑤⑥";
const PATTERN = [1, 3, 2, 4, 2, 1, 4, 3];

function rotate(exam) {
  let pi = 0;
  for (const dai of exam) {
    for (const q of dai.qs) {
      // 選択肢の並びに意味がある形式は動かさない。
      //  ・略年表（ア〜エ）／年代整序（6通りを決まった順に）
      //  ・正誤の組合せ（実物は必ず a正b正／a正b誤／a誤b正／a誤b誤 の順）
      //  ・空欄補充（実物は Ａの2値 × Ｂの2値 を規則的に並べる）
      //  ・メモ／会話（実物は「Ａのみ正しい／Ｂのみ正しい／二人とも正しい／二人とも誤っている」の順）
      if (/略年表|正誤の組合せ|空欄補充|メモ/.test(q.fmt || "") || q.nopt === 6) continue;
      const target = PATTERN[pi++ % PATTERN.length];
      const k = (target - q.a + 4) % 4;
      if (!k) continue;
      const rotated = new Array(4);
      q.c.forEach((v, i) => { rotated[(i + k) % 4] = v; });
      q.c = rotated;
      q.a = target;
      q.ex = q.ex.replace(/[①②③④]/g, (ch) => CIRCLE[(CIRCLE.indexOf(ch) + k) % 4]);
    }
  }
  return exam;
}

module.exports = { rotate, CIRCLE, PATTERN };
