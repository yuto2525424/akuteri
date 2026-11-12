# AQUA TERRITORY（アクテリ）Web版

水圏生物対戦カードゲームのオンライン対戦アプリです。横画面のブラウザゲームで、ホーム画面に追加してアプリとして使えます（PWA）。

## 必要なもの
- Node.js 18 以上

## 初回セットアップ
```bash
npm install
```

## 起動（遊ぶとき）
```bash
npm start
```
ブラウザで http://localhost:3000 を開きます。

- 1人目：「部屋を作る」→ 表示されたルームコードを相手に伝える
- 2人目：ルームコードを入力して「参加する」→ 対戦開始

同じPCの2つのブラウザ（または通常ウィンドウとシークレットウィンドウ）で試せます。

## 開発時
```bash
npm run dev
```
クライアントは http://localhost:5173、サーバーは http://localhost:3000 で動きます。

## テスト・型チェック
```bash
npm test
npm run typecheck
```

## アプリとしてインストール
- PC（Chrome / Edge）：アドレスバー右側のインストールアイコンから追加
- iPhone（Safari）：共有ボタン →「ホーム画面に追加」
- Android（Chrome）：メニュー →「アプリをインストール」

## フォルダ構成
```
src/shared/types.ts   ゲーム状態・アクションの型
src/shared/cards.ts   カードマスター（海・川 各30枚、生息地、デッキ構成）
src/shared/engine.ts  ゲームロジック（ターン、資源、戦闘、キーワード、効果）
src/client/           画面（React、横画面UI）
server/index.ts       オンライン対戦サーバー（Socket.IO、ルームコード、再接続）
public/               PWA（manifest、service worker、アイコン）
tests/engine.test.ts  ルールのテスト
```

## 実装上の注意
- ゲームの判定はすべてサーバー側（`engine.ts`）で行い、相手の手札・山札・テリトリーは送信しません。
- 1ターン1枚の資源制限、先攻1ターン目のドローなし、マリガンなしは仕様どおりです。
- 効果のうち、選択が必要なもの（コバンザメの装備先、混乱効果の変更先、濁りの対象など）は、画面で対象をタップして選びます。
- 毒棘・反撃放電など、対象が自動で決まる効果は「最もATKが高い生物」を選びます。
