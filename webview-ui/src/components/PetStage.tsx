import type { PetWorldState } from '../../../src/webview/contract';

interface Visual {
  label: string;
  caption: string;
  sky: [string, string];
  ground: string;
  body: string;
  belly: string;
  cheek: string;
  mouth: 'grin' | 'smile' | 'flat' | 'frown' | 'sad' | 'x';
  plants: number;
  leafTilt: number;
  sparkle: boolean;
}

const VISUALS: Record<PetWorldState, Visual> = {
  thriving: {
    label: 'Thriving',
    caption: 'Flourishing — clean, efficient prompts!',
    sky: ['#16412e', '#0f2a1f'],
    ground: '#2e7d4f',
    body: '#7ee2a8',
    belly: '#b6f0d0',
    cheek: '#39c47a',
    mouth: 'grin',
    plants: 5,
    leafTilt: 0,
    sparkle: true,
  },
  healthy: {
    label: 'Healthy',
    caption: 'Green and steady. Keep it up.',
    sky: ['#163f3a', '#0f2a27'],
    ground: '#2e7d6a',
    body: '#8fe0c8',
    belly: '#bff0e3',
    cheek: '#36c4a0',
    mouth: 'smile',
    plants: 4,
    leafTilt: 6,
    sparkle: false,
  },
  concerned: {
    label: 'Concerned',
    caption: 'Waste is creeping in — tighten your prompts.',
    sky: ['#403c18', '#2a270f'],
    ground: '#7d6e2e',
    body: '#e6d98f',
    belly: '#f2ead0',
    cheek: '#c4a836',
    mouth: 'flat',
    plants: 3,
    leafTilt: 16,
    sparkle: false,
  },
  critical: {
    label: 'Critical',
    caption: 'Struggling. Trim context and retries.',
    sky: ['#402a18', '#2a1b0f'],
    ground: '#7d562e',
    body: '#e6b48f',
    belly: '#f2dcc8',
    cheek: '#c47836',
    mouth: 'frown',
    plants: 2,
    leafTilt: 28,
    sparkle: false,
  },
  collapse: {
    label: 'Collapse',
    caption: 'Heavy waste. Refactor your prompts.',
    sky: ['#401b1b', '#2a0f0f'],
    ground: '#7d2e2e',
    body: '#e68f8f',
    belly: '#f2caca',
    cheek: '#c43636',
    mouth: 'sad',
    plants: 1,
    leafTilt: 42,
    sparkle: false,
  },
  dead: {
    label: 'Dormant',
    caption: 'Dormant. Score a clean prompt to revive it.',
    sky: ['#262626', '#161616'],
    ground: '#3a3a3a',
    body: '#9aa0a6',
    belly: '#c2c6ca',
    cheek: '#6b7177',
    mouth: 'x',
    plants: 0,
    leafTilt: 70,
    sparkle: false,
  },
};

function mouthPath(mouth: Visual['mouth']): string {
  switch (mouth) {
    case 'grin':
      return 'M104 115 Q120 134 136 115 Q120 123 104 115 Z';
    case 'smile':
      return 'M106 116 Q120 130 134 116';
    case 'flat':
      return 'M108 120 L132 120';
    case 'frown':
      return 'M106 125 Q120 113 134 125';
    case 'sad':
      return 'M104 127 Q120 109 136 127';
    case 'x':
    default:
      return 'M112 119 L128 119';
  }
}

export function PetStage({ world }: { world: PetWorldState }) {
  const v = VISUALS[world];
  const alive = world !== 'dead';

  return (
    <div class="petstage">
      <svg viewBox="0 0 240 180" class="petstage-svg" role="img" aria-label={`Guardian ${v.label}`}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color={v.sky[0]} />
            <stop offset="100%" stop-color={v.sky[1]} />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="240" height="180" rx="10" fill="url(#sky)" />
        <ellipse cx="120" cy="176" rx="150" ry="34" fill={v.ground} opacity="0.85" />

        {v.sparkle &&
          [30, 70, 180, 210, 150].map((x, i) => (
            <circle key={i} cx={x} cy={26 + (i % 3) * 16} r="1.6" fill="#d6ffe9" opacity="0.8" />
          ))}

        {Array.from({ length: v.plants }).map((_, i) => {
          const x = 26 + i * 42;
          return (
            <g key={i} transform={`translate(${x} 150)`}>
              <path d="M0 12 L0 0" stroke="#2f5d3a" stroke-width="2" />
              <path d="M0 2 q-7 -4 -10 2 q7 3 10 -2" fill="#3c8a4f" />
              <path d="M0 5 q7 -4 10 2 q-7 3 -10 -2" fill="#3c8a4f" />
            </g>
          );
        })}

        {/* leaf antenna — wilts as health drops */}
        <g transform={`translate(120 56) rotate(${v.leafTilt})`}>
          <path d="M0 0 L0 -16" stroke="#2f5d3a" stroke-width="2.5" />
          <path d="M0 -16 q10 -8 2 -20 q-12 6 -2 20" fill={alive ? '#5bd08a' : '#6b7177'} />
        </g>

        {/* body */}
        <g class={alive ? 'pet-body breathe' : 'pet-body'}>
          <ellipse cx="120" cy="96" rx="48" ry="44" fill={v.body} stroke="rgba(0,0,0,0.18)" stroke-width="2" />
          <ellipse cx="120" cy="104" rx="30" ry="26" fill={v.belly} opacity="0.7" />

          {/* cheeks */}
          <circle cx="92" cy="104" r="6" fill={v.cheek} opacity="0.55" />
          <circle cx="148" cy="104" r="6" fill={v.cheek} opacity="0.55" />

          {/* eyes */}
          {world === 'dead' ? (
            <g stroke="#2a2f33" stroke-width="2.4" stroke-linecap="round">
              <path d="M98 88 l8 8 M106 88 l-8 8" />
              <path d="M134 88 l8 8 M142 88 l-8 8" />
            </g>
          ) : (
            <g>
              <circle cx="102" cy="92" r="7" fill="#ffffff" />
              <circle cx="138" cy="92" r="7" fill="#ffffff" />
              <circle cx="103" cy="93" r="3.4" fill="#23303a" />
              <circle cx="139" cy="93" r="3.4" fill="#23303a" />
            </g>
          )}

          {/* mouth */}
          <path
            d={mouthPath(v.mouth)}
            fill={v.mouth === 'grin' ? '#7a2230' : 'none'}
            stroke="#3a2230"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </g>
      </svg>

      <div class="petstage-caption">
        <span class={`world-chip world-${world}`}>{v.label}</span>
        <span class="petstage-sub">{v.caption}</span>
      </div>
    </div>
  );
}
