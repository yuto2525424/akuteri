// カードの絵を管理する。
//   node scripts/card-art.mjs check               … 絵が無いカードを一覧表示
//   node scripts/card-art.mjs import <フォルダ>   … フォルダ内の画像（ファイル名＝カードID）を
//                                                    public/cards/ に、ゲーム用の大きさで取り込む
// 画像は png / jpg / webp どれでもよい。ファイル名はカードID（例: SEA-001.png, RIVER-E03.webp）。
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const OUT_DIR = join(ROOT, 'public', 'cards');
const CARD_IDS = [
  'SEA-001', 'SEA-002', 'SEA-003', 'SEA-004', 'SEA-005', 'SEA-006', 'SEA-007', 'SEA-008', 'SEA-009',
  'SEA-C01', 'SEA-C02', 'SEA-E01', 'SEA-E02', 'SEA-E03',
  'RIVER-001', 'RIVER-002', 'RIVER-003', 'RIVER-004', 'RIVER-005', 'RIVER-006', 'RIVER-007',
  'RIVER-008', 'RIVER-009', 'RIVER-C01', 'RIVER-C02', 'RIVER-E01', 'RIVER-E02', 'RIVER-E03',
];
const W = 540;
const H = 400;

function check() {
  const missing = CARD_IDS.filter((id) => !existsSync(join(OUT_DIR, `${id}.jpg`)));
  console.log(`絵あり: ${CARD_IDS.length - missing.length}/${CARD_IDS.length}`);
  if (missing.length) console.log(`絵が無いカード: ${missing.join(', ')}`);
  else console.log('すべてのカードに絵があります');
}

async function importFrom(dir) {
  if (!dir || !existsSync(dir)) {
    console.error('フォルダが見つかりません。使い方: node scripts/card-art.mjs import <フォルダ>');
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  let done = 0;
  for (const file of readdirSync(dir)) {
    const ext = extname(file).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) continue;
    const id = basename(file, extname(file)).toUpperCase();
    if (!CARD_IDS.includes(id)) {
      console.log(`スキップ（カードIDではない）: ${file}`);
      continue;
    }
    // 中央をゲームの枠の比率（540×400）に切り抜いて保存
    await sharp(join(dir, file))
      .resize(W, H, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 90 })
      .toFile(join(OUT_DIR, `${id}.jpg`));
    console.log(`取り込み: ${id}`);
    done++;
  }
  console.log(`${done} 枚を取り込みました`);
  check();
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'import') await importFrom(arg);
else check();
