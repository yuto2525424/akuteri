// カードが移動する演出：山札→手札（ドロー）、手札→場（出す）。
// 操作の直前に出発点（山札・手札のカードの位置）を覚えておき、
// 操作の結果あらわれたカードを、その出発点から滑らせて出す。

interface Origin {
  x: number;
  y: number;
  w: number;
  h: number;
  delay: number;
}

let origin: Origin | null = null;

/** 出発点の位置を覚える（delay：飛ぶまでの待ち時間。割れる演出の後に飛ばすときに使う） */
export function rememberOrigin(el: Element | null, delay = 0) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.width === 0) return;
  origin = { x: r.left, y: r.top, w: r.width, h: r.height, delay };
}

/** 操作が拒否されたときは、出発点を捨てる */
export function clearOrigin() {
  origin = null;
}

/** あらわれたカードを、出発点から目的の位置まで飛ばす（出発点が無ければ何もしない） */
export function flyIn(el: HTMLElement | null, duration = 520) {
  if (!el || !origin) return;
  const o = origin;
  origin = null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  const dx = o.x + o.w / 2 - (r.left + r.width / 2);
  const dy = o.y + o.h / 2 - (r.top + r.height / 2);
  const s = o.w / r.width;
  if (typeof el.animate !== 'function') return;
  // 待ち時間がある間は、出発点に重ならないよう見えないままにしておく
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: o.delay > 0 ? 0 : 0.35, offset: 0 },
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 1 },
    ],
    {
      duration,
      delay: o.delay,
      easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      fill: o.delay > 0 ? 'backwards' : 'none',
    },
  );
}
