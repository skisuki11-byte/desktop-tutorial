/* 正解の偏りをならす回転処理。build.js と verify.js が同じものを使う（ずれ防止）。 */
const CIRCLE = "①②③④⑤⑥";
const PATTERN = [1, 3, 2, 4, 2, 1, 4, 3];

function rotate(exam) {
  let pi = 0;
  for (const dai of exam) {
    for (const q of dai.qs) {
      // ア〜エを選ぶ略年表と、並べ方6通りを決まった順に並べる年代整序は動かさない
      if (/略年表/.test(q.fmt || "") || q.nopt === 6) continue;
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
