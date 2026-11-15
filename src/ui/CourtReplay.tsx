import { useEffect, useRef, useState } from 'react';
import type { CourtSnapshot } from '../possession/replay';
import { COURT_WIDTH, COURT_HEIGHT } from '../possession/types';
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
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const last = Math.max(0, frames.length - 1);
  const progressRef = useRef(0);
  progressRef.current = progress;

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
        setProgress(last);
        setPlaying(false);
        return;
      }
      setProgress(next);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, last]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || frames.length === 0) return;
    drawCourt(ctx, frames, progress, roles);
  }, [frames, progress, roles]);

  if (frames.length === 0) return <p>No replay available.</p>;

  const frameIndex = Math.min(last, Math.round(progress));

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
            setProgress(0);
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
          value={progress}
          aria-label="Scrub replay"
          onChange={(e) => {
            setPlaying(false);
            setProgress(Number(e.target.value));
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

function drawCourt(ctx: CanvasRenderingContext2D, frames: CourtSnapshot[], progress: number, roles?: CourtRoles): void {
  const { ball, players } = interpolate(frames, progress);
  ctx.clearRect(0, 0, COURT_WIDTH, COURT_HEIGHT);
  ctx.fillStyle = '#1b2a3a';
  ctx.fillRect(0, 0, COURT_WIDTH, COURT_HEIGHT);
  ctx.strokeStyle = '#4a6078';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, COURT_WIDTH - 2, COURT_HEIGHT - 2);

  // Subtle dashed arc from the ball's first keyframe to where it is now: the shot or pass line.
  const start = frames[0]?.ballPos;
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

  for (const [id, p] of players) {
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
  ctx.beginPath();
  ctx.fillStyle = COLOR.ball;
  ctx.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
  ctx.fill();
}

function colorFor(id: string, roles?: CourtRoles): string {
  if (!roles) return COLOR.unknown;
  if (id === roles.actorId) return COLOR.user;
  if (roles.offenseIds.includes(id)) return COLOR.offense;
  if (roles.defenseIds.includes(id)) return COLOR.defense;
  return COLOR.unknown;
}
