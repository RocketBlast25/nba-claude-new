import { useEffect, useRef, useState } from 'react';
import type { CourtSnapshot } from '../possession/replay';
import { COURT_WIDTH, COURT_HEIGHT } from '../possession/types';

/** Which side a player is on, and whether it is the user's controlled player. */
export interface CourtRoles {
  /** Ids of the user's offense, with the user's player first. */
  offenseIds: string[];
  /** Ids of the defenders. */
  defenseIds: string[];
  /** The user's player, drawn with its own colour. */
  actorId: string;
}

/**
 * Top-down Canvas 2D replay of court snapshots. Draws the frame at the scrub
 * position; play advances through frames on a timer. Holds no simulation state.
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
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const last = Math.max(0, frames.length - 1);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setIndex((i) => {
        if (i >= last) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [playing, last]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const frame = frames[index];
    if (!canvas || !ctx || !frame) return;
    drawCourt(ctx, frame, roles);
  }, [frames, index, roles]);

  if (frames.length === 0) return <p>No replay available.</p>;

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={COURT_WIDTH}
        height={COURT_HEIGHT}
        role="img"
        aria-label={`Court replay, frame ${index + 1} of ${frames.length}`}
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      <div>
        <button type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setPlaying(true);
          }}
        >
          Replay
        </button>
        <input
          type="range"
          min={0}
          max={last}
          value={index}
          aria-label="Scrub replay"
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
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

function drawCourt(ctx: CanvasRenderingContext2D, frame: CourtSnapshot, roles?: CourtRoles): void {
  ctx.clearRect(0, 0, COURT_WIDTH, COURT_HEIGHT);
  ctx.fillStyle = '#1b2a3a';
  ctx.fillRect(0, 0, COURT_WIDTH, COURT_HEIGHT);
  ctx.strokeStyle = '#4a6078';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, COURT_WIDTH - 2, COURT_HEIGHT - 2);
  for (const p of frame.players) {
    ctx.beginPath();
    ctx.fillStyle = colorFor(p.id, roles);
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.fillStyle = COLOR.ball;
  ctx.arc(frame.ballPos.x, frame.ballPos.y, 6, 0, Math.PI * 2);
  ctx.fill();
}

function colorFor(id: string, roles?: CourtRoles): string {
  if (!roles) return COLOR.unknown;
  if (id === roles.actorId) return COLOR.user;
  if (roles.offenseIds.includes(id)) return COLOR.offense;
  if (roles.defenseIds.includes(id)) return COLOR.defense;
  return COLOR.unknown;
}
