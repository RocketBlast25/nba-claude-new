import { useEffect, useRef, useState } from 'react';
import type { CourtSnapshot } from '../possession/replay';
import { COURT_WIDTH, COURT_HEIGHT } from '../possession/types';

/**
 * Top-down Canvas 2D replay of court snapshots. Draws the frame at the scrub
 * position; play advances through frames on a timer. Holds no simulation state.
 */
export function CourtReplay({ frames }: { frames: CourtSnapshot[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
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
    drawCourt(ctx, frame);
  }, [frames, index]);

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

function drawCourt(ctx: CanvasRenderingContext2D, frame: CourtSnapshot): void {
  ctx.clearRect(0, 0, COURT_WIDTH, COURT_HEIGHT);
  ctx.fillStyle = '#1b2a3a';
  ctx.fillRect(0, 0, COURT_WIDTH, COURT_HEIGHT);
  ctx.strokeStyle = '#4a6078';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, COURT_WIDTH - 2, COURT_HEIGHT - 2);
  for (const p of frame.players) {
    ctx.beginPath();
    ctx.fillStyle = '#7fb3ff';
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.fillStyle = '#ffb347';
  ctx.arc(frame.ballPos.x, frame.ballPos.y, 6, 0, Math.PI * 2);
  ctx.fill();
}
