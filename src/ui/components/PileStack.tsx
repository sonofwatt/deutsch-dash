import type React from 'react';

/**
 * How many outlines to peek out below a pile of `count` cards. Capped at `max`
 * so a 25-card wood pile does not turn into a staircase; the exact number is on
 * the label next to it, this is the at-a-glance "there is more under here" cue.
 */
export function depthLayers(count: number, max = 3): number {
  if (count <= 1) return 0;
  return Math.min(max, Math.ceil((count - 1) / 3));
}

/** Renders `layers` card outlines stepping down behind `children`. */
export function PileStack(props: {
  layers: number;
  children: React.ReactNode;
  className?: string;
  'data-drop'?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}) {
  const n = Math.max(0, props.layers);
  return (
    <div className={`pile-depth${props.className ? ` ${props.className}` : ''}`}
      data-drop={props['data-drop']} onClick={props.onClick}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="pile-layer" style={{ top: (n - i) * 3 }} />
      ))}
      <div className="pile-top">{props.children}</div>
    </div>
  );
}
