import { useCallback, useEffect, useRef, useState } from 'react';
import type { CourtSnapshot } from '../possession/replay';
import { COURT_WIDTH, COURT_HEIGHT } from '../possession/types';
import { RELEASE_FRAME } from '../possession/keyMomentCourt';
import type { Position } from '../sim/core/models';

/** Which side a player is on, and whether it is the user's controlled player. */
export interface CourtRoles {
  /** Ids of the user's offense, with the user's player first. */
  offenseIds: string[];
  /** Ids of the defenders. */
  defenseIds: string[];
  /** The user's player, drawn with its own colour. */
  actorId: string;
  /** Display label for each player id: jersey number and position. */
  labels?: Record<string, { number: number; position: Position }>;
}

/** Total playback time across all keyframes, in milliseconds. */
const PLAYBACK_MS = 3500;
/** Ball height (court units) at which its floor shadow has shrunk to half size. */
const SHADOW_FALLOFF = 120;
/** Number of past keyframes drawn as the ball's trail. */
const TRAIL_LENGTH = 4;

/**
 * Top-down Canvas 2D replay of court snapshots. Playback runs on requestAnimationFrame
 * and interpolates player and ball positions between keyframes, so motion is smooth.
 * Holds no simulation state: the frames are the canonical engine output.
 * With `autoPlay`, playback starts on mount and stops on the last frame.
 */
export function CourtReplay({
  frames,
  roles,
  autoPlay = false,
}: {
  frames: CourtSnapshot[];
  roles?: CourtRoles;
  autoPlay?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The playhead lives in a ref and is drawn directly; React state only tracks the
  // displayed frame index and the play/pause state, so it re-renders per frame, not per tick.
  const progressRef = useRef(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const last = Math.max(0, frames.length - 1);

  // Latest props live in refs so the playback loop does not restart when a parent passes a
  // new `roles` object on re-render.
  const framesRef = useRef(frames);
  const rolesRef = useRef(roles);
  framesRef.current = frames;
  rolesRef.current = roles;

  const paint = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    const current = framesRef.current;
    if (!ctx || current.length === 0) return;
    drawCourt(ctx, current, progressRef.current, rolesRef.current);
    const shown = Math.min(current.length - 1, Math.round(progressRef.current));
    setFrameIndex((prev) => (prev === shown ? prev : shown));
  }, []);

  // Redraw on new frames or roles. New frames restart the playhead, so an old position is not reused.
  useEffect(() => {
    progressRef.current = 0;
    paint();
  }, [frames, roles, paint]);

  // Progress is a 0..last fractional frame index, advanced by elapsed time.
  useEffect(() => {
    if (!playing || last === 0) return;
    let raf = 0;
    let startedAt: number | null = null;
    const startProgress = progressRef.current >= last ? 0 : progressRef.current;
    const tick = (now: number) => {
      if (startedAt === null) startedAt = now;
      const next = startProgress + ((now - startedAt) / PLAYBACK_MS) * last;
      if (next >= last) {
        progressRef.current = last;
        paint();
        setPlaying(false);
        return;
      }
      progressRef.current = next;
      paint();
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, last, paint]);

  // Pause when the tab is hidden so background tabs do not keep scheduling frames.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') setPlaying(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (frames.length === 0) return <p>No replay available.</p>;

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={COURT_WIDTH}
        height={COURT_HEIGHT}
        role="img"
        aria-label={`Court replay, frame ${frameIndex + 1} of ${frames.length}`}
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      <div>
        <button type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          onClick={() => {
            progressRef.current = 0;
            paint();
            setPlaying(true);
          }}
        >
          Replay
        </button>
        <input
          type="range"
          min={0}
          max={last}
          step="any"
          value={frameIndex}
          aria-label="Scrub replay"
          onChange={(e) => {
            setPlaying(false);
            progressRef.current = Number(e.target.value);
            paint();
          }}
        />
      </div>
    </div>
  );
}

const COLOR = {
  user: '#ffd166',
  offense: '#7fb3ff',
  defense: '#ef6f6c',
  unknown: '#9aa5b1',
  ball: '#ffb347',
};

interface Point {
  x: number;
  y: number;
}

/** Linear interpolation between the two keyframes around a fractional index. */
function interpolate(frames: CourtSnapshot[], progress: number): { ball: Point; players: Map<string, Point> } {
  const i = Math.min(frames.length - 1, Math.floor(progress));
  const j = Math.min(frames.length - 1, i + 1);
  const t = progress - i;
  const a = frames[i]!;
  const b = frames[j]!;
  const lerp = (p: Point, q: Point): Point => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const players = new Map<string, Point>();
  for (const pa of a.players) {
    const pb = b.players.find((p) => p.id === pa.id) ?? pa;
    players.set(pa.id, lerp(pa, pb));
  }
  return { ball: lerp(a.ballPos, b.ballPos), players };
}

/**
 * Where the ball left the carrier: the ball's position at the release keyframe, i.e.
 * the shooter's or passer's coordinates at release, not the possession's start.
 */
/**
 * Unit direction a player is moving at `progress`, from its keyframe-to-keyframe motion.
 * Returns null when the player is standing still, so no facing tick is drawn.
 */
function facingOf(frames: CourtSnapshot[], progress: number, id: string): Point | null {
  const i = Math.min(frames.length - 1, Math.floor(progress));
  const j = Math.min(frames.length - 1, i + 1);
  const a = frames[i]!.players.find((p) => p.id === id);
  const b = frames[j]!.players.find((p) => p.id === id);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return null;
  return { x: dx / len, y: dy / len };
}

function releaseOrigin(frames: CourtSnapshot[]): Point | undefined {
  return frames[RELEASE_FRAME]?.ballPos;
}

function drawCourt(ctx: CanvasRenderingContext2D, frames: CourtSnapshot[], progress: number, roles?: CourtRoles): void {
  const { ball, players } = interpolate(frames, progress);
  ctx.clearRect(0, 0, COURT_WIDTH, COURT_HEIGHT);
  ctx.fillStyle = '#1b2a3a';
  ctx.fillRect(0, 0, COURT_WIDTH, COURT_HEIGHT);
  ctx.strokeStyle = '#4a6078';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, COURT_WIDTH - 2, COURT_HEIGHT - 2);
  drawMarkings(ctx);

  // Dashed arc from the release point (the ball's last keyframe on the carrier) to where it is now.
  const start = releaseOrigin(frames);
  if (start) {
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    const midX = (start.x + ball.x) / 2;
    const midY = Math.min(start.y, ball.y) - 40;
    ctx.quadraticCurveTo(midX, midY, ball.x, ball.y);
    ctx.stroke();
    ctx.restore();
  }

  for (const [id, raw] of players) {
    // Keep the circle and its labels fully on the canvas.
    const p = { x: Math.min(COURT_WIDTH - 14, Math.max(14, raw.x)), y: Math.min(COURT_HEIGHT - 30, Math.max(14, raw.y)) };
    // Facing: the direction the player is moving between keyframes, when it is moving.
    const facing = facingOf(frames, progress, id);
    if (facing) {
      ctx.save();
      ctx.strokeStyle = colorFor(id, roles);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x + facing.x * 10, p.y + facing.y * 10);
      ctx.lineTo(p.x + facing.x * 16, p.y + facing.y * 16);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.fillStyle = colorFor(id, roles);
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    const label = roles?.labels?.[id];
    if (label) {
      ctx.fillStyle = '#0b1420';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(label.number), p.x, p.y);
      ctx.fillStyle = '#e6edf5';
      ctx.font = '10px sans-serif';
      ctx.fillText(label.position, p.x, p.y + 18);
    }
  }
  drawBallTrail(ctx, frames, progress);
  drawBall(ctx, ball);
}

/**
 * Fading trail behind the ball over the last few keyframes, so passes and dribbles read
 * as motion. Each segment's alpha decreases toward the tail.
 */
function drawBallTrail(ctx: CanvasRenderingContext2D, frames: CourtSnapshot[], progress: number): void {
  const head = Math.min(frames.length - 1, Math.floor(progress));
  const from = Math.max(0, head - TRAIL_LENGTH);
  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let k = from; k < head; k++) {
    const a = frames[k]!.ballPos;
    const b = frames[k + 1]!.ballPos;
    const alpha = ((k - from + 1) / (head - from)) * 0.5;
    ctx.strokeStyle = `rgba(255, 179, 71, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Ball with elevation: a floor shadow sits at the ball's ground point and shrinks and
 * fades as the ball rises, while the ball itself grows slightly and lifts above the floor.
 */
function drawBall(ctx: CanvasRenderingContext2D, ball: Point & { z?: number }): void {
  const z = Math.max(0, ball.z ?? 0);
  const lift = Math.min(1, z / SHADOW_FALLOFF);
  // Floor shadow: fixed at the ground point, smaller and lighter as the ball gets higher.
  ctx.beginPath();
  ctx.fillStyle = `rgba(0, 0, 0, ${(0.5 * (1 - lift)).toFixed(3)})`;
  ctx.ellipse(ball.x, ball.y, 6 * (1 - 0.5 * lift), 3 * (1 - 0.5 * lift), 0, 0, Math.PI * 2);
  ctx.fill();
  // Ball body rises with z (drawn higher on screen) and scales up slightly at the top.
  ctx.beginPath();
  ctx.fillStyle = COLOR.ball;
  ctx.arc(ball.x, ball.y - z, 6 * (1 + 0.25 * lift), 0, Math.PI * 2);
  ctx.fill();
}

/** Court lines, paint, arcs, hoops and backboards on the logical 940x500 court. */
function drawMarkings(ctx: CanvasRenderingContext2D): void {
  const H = COURT_HEIGHT;
  const cy = H / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(230, 237, 245, 0.35)';
  ctx.fillStyle = 'rgba(230, 237, 245, 0.06)';
  ctx.lineWidth = 2;
  // Half-court line.
  ctx.beginPath();
  ctx.moveTo(COURT_WIDTH / 2, 0);
  ctx.lineTo(COURT_WIDTH / 2, H);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(COURT_WIDTH / 2, cy, 60, 0, Math.PI * 2);
  ctx.stroke();
  for (const side of [0, 1]) {
    const baseX = side === 0 ? 0 : COURT_WIDTH;
    const dir = side === 0 ? 1 : -1;
    // Paint (key) and free-throw circle.
    ctx.fillRect(side === 0 ? 0 : COURT_WIDTH - 190, cy - 80, 190, 160);
    ctx.strokeRect(side === 0 ? 0 : COURT_WIDTH - 190, cy - 80, 190, 160);
    ctx.beginPath();
    ctx.arc(baseX + dir * 190, cy, 60, side === 0 ? -Math.PI / 2 : Math.PI / 2, side === 0 ? Math.PI / 2 : -Math.PI / 2, side === 1);
    ctx.stroke();
    // Three-point arc.
    ctx.beginPath();
    ctx.arc(baseX + dir * 52.5, cy, 237.5, side === 0 ? -1.18 : Math.PI - 1.18, side === 0 ? 1.18 : Math.PI + 1.18);
    ctx.stroke();
    // Straight corner three-point lines, 3 ft from each sideline.
    ctx.beginPath();
    ctx.moveTo(baseX, 30);
    ctx.lineTo(baseX + dir * 144, 30);
    ctx.moveTo(baseX, H - 30);
    ctx.lineTo(baseX + dir * 144, H - 30);
    ctx.stroke();
    // Backboard and hoop.
    ctx.strokeStyle = 'rgba(230, 237, 245, 0.7)';
    ctx.beginPath();
    ctx.moveTo(baseX + dir * 40, cy - 30);
    ctx.lineTo(baseX + dir * 40, cy + 30);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(baseX + dir * 52.5, cy, 7.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230, 237, 245, 0.35)';
  }
  ctx.restore();
}

function colorFor(id: string, roles?: CourtRoles): string {
  if (!roles) return COLOR.unknown;
  if (id === roles.actorId) return COLOR.user;
  if (roles.offenseIds.includes(id)) return COLOR.offense;
  if (roles.defenseIds.includes(id)) return COLOR.defense;
  return COLOR.unknown;
}
