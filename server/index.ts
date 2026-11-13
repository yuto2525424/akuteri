import express from 'express';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { applyAction, createGame, viewFor, OTHER } from '../src/shared/engine';
import { validateDeck } from '../src/shared/cards';
import { cpuNeedsDecision, cpuStep, type CpuLevel } from '../src/shared/cpu';
import { recordGame, recordPageView, summary } from './stats';
import type { Action, Faction, GameState, PlayerId } from '../src/shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

interface Seat {
  id: PlayerId;
  token: string;
  name: string;
  faction: Faction;
  socketId: string | null;
  /** 自分で組んだデッキ（正しいものだけ受け付ける） */
  deck?: string[];
}

interface Room {
  code: string;
  seats: Seat[];
  state: GameState | null;
  rematchVotes: Set<PlayerId>;
  /** CPU対戦か（席Bの相手がCPU） */
  cpu: boolean;
  cpuLevel: CpuLevel;
  cpuTimer?: ReturnType<typeof setTimeout>;
}

/** CPUの1手あたりの待ち時間（人が動きを見て理解できる速さ） */
const CPU_DELAY_MS = 1400;

/** CPUの番なら、少し待ってから1手進める（終わるまで繰り返す） */
function scheduleCpu(room: Room) {
  if (!room.cpu || !room.state || room.cpuTimer) return;
  if (!cpuNeedsDecision(room.state, 'B')) return;
  room.cpuTimer = setTimeout(() => {
    room.cpuTimer = undefined;
    if (!room.state) return;
    const r = cpuStep(room.state, 'B', room.cpuLevel);
    if (r) {
      room.state = r.state;
      broadcast(room);
    }
    scheduleCpu(room);
  }, CPU_DELAY_MS);
}

const rooms = new Map<string, Room>();

function makeCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) code += alphabet[randomBytes(1)[0] % alphabet.length];
    if (!rooms.has(code)) return code;
  }
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json({ limit: '2kb' }));
app.use(express.static(join(__dirname, '..', 'dist')));
app.get('/healthz', (_req, res) => res.send('ok'));

// 訪問者・プレイ人数（個人情報は含まない）
app.post('/api/visit', (req, res) => {
  recordPageView(req.body?.visitorId);
  res.json({ ok: true });
});
app.get('/api/stats', (_req, res) => res.json(summary()));
app.get('/stats', (_req, res) => {
  const rows = Object.entries(summary())
    .map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`)
    .join('');
  res.send(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AQUA TERRITORY 集計</title><body style="font-family:sans-serif;padding:20px"><h1>AQUA TERRITORY 集計</h1><table style="border-collapse:collapse;font-size:18px">${rows}</table><p>再読み込みで最新の数字になります。</p></body></html>`);
});

app.get('*', (_req, res) => res.sendFile(join(__dirname, '..', 'dist', 'index.html')));

function broadcast(room: Room) {
  for (const seat of room.seats) {
    if (!seat.socketId) continue;
    io.to(seat.socketId).emit('room', roomPayload(room, seat));
  }
}

function roomPayload(room: Room, seat: Seat) {
  const opponent = room.seats.find((s) => s.id !== seat.id);
  return {
    code: room.code,
    you: seat.id,
    token: seat.token,
    opponentJoined: !!opponent,
    state: room.state ? viewFor(room.state, seat.id) : null,
    rematchVotes: [...room.rematchVotes],
  };
}

function startGame(room: Room) {
  // 遊んだ人の数を記録（CPU対戦の席は数えない）
  const ids = room.seats.map((s) => (s.socketId ? io.sockets.sockets.get(s.socketId)?.data.playerId : undefined));
  recordGame(ids, room.cpu ? 'cpu' : 'human');
  const [a, b] = room.seats;
  room.state = createGame(
    Math.floor(Math.random() * 1e9),
    { name: a.name, faction: a.faction, deck: a.deck },
    { name: b.name, faction: b.faction, deck: b.deck },
  );
  room.rematchVotes.clear();
}

io.on('connection', (socket) => {
  // 接続直後に、ブラウザの訪問者番号（個人情報ではない）を受け取る
  socket.on('hello', (payload: { playerId?: unknown }) => {
    if (typeof payload?.playerId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(payload.playerId)) {
      socket.data.playerId = payload.playerId;
    }
  });

  socket.on('create_room', (payload: { name: string; faction: Faction; deck?: unknown }, ack?: (r: unknown) => void) => {
    const code = makeCode();
    const seat: Seat = { id: 'A', token: randomBytes(16).toString('hex'), name: clean(payload.name, 'プレイヤーA'), faction: payload.faction, socketId: socket.id, deck: validateDeck(payload.faction, payload.deck) ?? undefined };
    const room: Room = { code, seats: [seat], state: null, rematchVotes: new Set(), cpu: false, cpuLevel: 'intermediate' };
    rooms.set(code, room);
    socket.data.room = code;
    socket.data.token = seat.token;
    ack?.({ ok: true, code, token: seat.token });
    broadcast(room);
  });

  socket.on('create_cpu_room', (payload: { name: string; faction: Faction; cpuFaction: Faction; level?: CpuLevel; deck?: unknown }, ack?: (r: unknown) => void) => {
    const code = makeCode();
    const seat: Seat = { id: 'A', token: randomBytes(16).toString('hex'), name: clean(payload.name, 'プレイヤー'), faction: payload.faction, socketId: socket.id, deck: validateDeck(payload.faction, payload.deck) ?? undefined };
    const level: CpuLevel = payload.level === 'beginner' || payload.level === 'advanced' ? payload.level : 'intermediate';
    const cpuName = { beginner: 'CPU（初級）', intermediate: 'CPU（中級）', advanced: 'CPU（上級）' }[level];
    const cpuSeat: Seat = { id: 'B', token: 'cpu', name: cpuName, faction: payload.cpuFaction, socketId: null };
    const room: Room = { code, seats: [seat, cpuSeat], state: null, rematchVotes: new Set(), cpu: true, cpuLevel: level };
    rooms.set(code, room);
    socket.data.room = code;
    socket.data.token = seat.token;
    startGame(room);
    ack?.({ ok: true, code, token: seat.token });
    broadcast(room);
    scheduleCpu(room);
  });

  socket.on('join_room', (payload: { code: string; name: string; faction: Faction; deck?: unknown }, ack?: (r: unknown) => void) => {
    const room = rooms.get(String(payload.code ?? '').toUpperCase());
    if (!room) return ack?.({ ok: false, error: '部屋が見つかりません' });
    if (room.seats.length >= 2) return ack?.({ ok: false, error: '満員です' });
    const seat: Seat = { id: 'B', token: randomBytes(16).toString('hex'), name: clean(payload.name, 'プレイヤーB'), faction: payload.faction, socketId: socket.id, deck: validateDeck(payload.faction, payload.deck) ?? undefined };
    room.seats.push(seat);
    socket.data.room = room.code;
    socket.data.token = seat.token;
    startGame(room);
    ack?.({ ok: true, code: room.code, token: seat.token });
    broadcast(room);
  });

  socket.on('rejoin', (payload: { code: string; token: string }, ack?: (r: unknown) => void) => {
    const room = rooms.get(payload.code);
    const seat = room?.seats.find((s) => s.token === payload.token);
    if (!room || !seat) return ack?.({ ok: false, error: '再接続できません' });
    seat.socketId = socket.id;
    socket.data.room = room.code;
    socket.data.token = seat.token;
    ack?.({ ok: true });
    broadcast(room);
  });

  socket.on('action', (action: Action, ack?: (r: unknown) => void) => {
    const room = findRoom(socket);
    const seat = room && findSeat(room, socket);
    if (!room || !seat) return ack?.({ ok: false, error: '部屋に参加していません' });
    if (!room.state) return ack?.({ ok: false, error: '相手の参加を待っています' });
    const r = applyAction(room.state, seat.id, action);
    if (r.ok) {
      room.state = r.state;
      broadcast(room);
      scheduleCpu(room);
      ack?.({ ok: true });
    } else {
      ack?.({ ok: false, error: r.error });
    }
  });

  socket.on('rematch', (ack?: (r: unknown) => void) => {
    const room = findRoom(socket);
    const seat = room && findSeat(room, socket);
    if (!room || !seat || !room.state || room.seats.length < 2) return ack?.({ ok: false, error: '対戦中ではありません' });
    room.rematchVotes.add(seat.id);
    if (room.cpu) room.rematchVotes.add('B'); // CPUは再戦に自動で同意
    if (room.rematchVotes.size === 2) {
      startGame(room);
      scheduleCpu(room);
    }
    ack?.({ ok: true });
    broadcast(room);
  });

  socket.on('disconnect', () => {
    const room = findRoom(socket);
    const seat = room && findSeat(room, socket);
    if (seat) seat.socketId = null;
  });
});

function findRoom(socket: { data: Record<string, unknown> }): Room | undefined {
  const code = socket.data.room as string | undefined;
  return code ? rooms.get(code) : undefined;
}

function findSeat(room: Room, socket: { data: Record<string, unknown> }): Seat | undefined {
  const token = socket.data.token as string | undefined;
  return room.seats.find((s) => s.token === token);
}

function clean(name: string, fallback: string): string {
  const v = String(name ?? '').trim().slice(0, 12);
  return v || fallback;
}

// 放置された部屋を掃除（1時間で破棄）
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyOnline = room.seats.some((s) => s.socketId);
    if (!anyOnline && (room as Room & { idleSince?: number }).idleSince === undefined) {
      (room as Room & { idleSince?: number }).idleSince = now;
    }
    if (!anyOnline && now - ((room as Room & { idleSince?: number }).idleSince ?? now) > 60 * 60_000) {
      rooms.delete(code);
    }
    if (anyOnline) (room as Room & { idleSince?: number }).idleSince = undefined;
  }
}, 60_000).unref();

void OTHER;
httpServer.listen(PORT, () => {
  console.log(`AQUA TERRITORY server: http://localhost:${PORT}`);
});
