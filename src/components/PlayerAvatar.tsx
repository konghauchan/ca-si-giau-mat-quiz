import { AVATARS, avatarId } from '@/lib/playerAppearance';

const ink = '#273047';

function Eyes({ left = 37, right = 59, y = 49, sleepy = false }: { left?: number; right?: number; y?: number; sleepy?: boolean }) {
  return sleepy ? <g stroke={ink} strokeWidth="3.5" strokeLinecap="round"><path d={`M${left - 5} ${y}q5 5 10 0`} /><path d={`M${right - 5} ${y}q5 5 10 0`} /></g> : <g fill={ink}><ellipse cx={left} cy={y} rx="3.8" ry="5" /><ellipse cx={right} cy={y} rx="3.8" ry="5" /></g>;
}

function Grin({ y = 64 }: { y?: number }) {
  return <path d={`M39 ${y - 3}q9 11 18 0`} fill="none" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />;
}

function Character({ index, main, accent }: { index: number; main: string; accent: string }) {
  switch (index) {
    case 0: return <>
      <path d="M21 77Q8 53 22 31Q37 12 60 20Q82 28 78 59Q76 79 55 82Z" fill={main} />
      <circle cx="57" cy="38" r="23" fill="#fff" /><circle cx="62" cy="39" r="10" fill={ink} /><circle cx="65" cy="35" r="3" fill="#fff" />
      <circle cx="32" cy="55" r="4" fill={ink} /><path d="M39 70q10 9 20-1" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M20 29q-8-9-12-4M65 19q8-13 15-10" fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" />
    </>;
    case 1: return <>
      <circle cx="29" cy="30" r="14" fill={main} /><circle cx="67" cy="30" r="14" fill={main} />
      <ellipse cx="48" cy="56" rx="37" ry="30" fill={main} /><Eyes y={40} /><circle cx="32" cy="62" r="3" fill={accent} /><circle cx="64" cy="62" r="3" fill={accent} />
      <path d="M34 68q14 11 28 0" fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" /><path d="M18 29h21M57 29h21" stroke={ink} strokeWidth="4" />
    </>;
    case 2: return <>
      <path d="M22 76Q9 65 17 48Q10 31 27 27Q28 13 45 19Q57 10 68 23Q85 23 80 42Q91 52 78 66Q78 83 58 79Q42 87 32 77Z" fill={main} />
      <path d="M48 20v19m-23-9 11 9m35-13-9 13M20 55l13-4m44 2-13-3M35 77l6-12m23 11-7-12" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" />
      <Eyes y={52} /><path d="M43 68q5-5 10 0" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
    </>;
    case 3: return <>
      <path d="M17 43 20 12 39 27Q48 21 57 27L76 12 79 43Q84 73 62 81H34Q12 74 17 43Z" fill={main} />
      <path d="m23 20 13 15m37-15L60 35" stroke={accent} strokeWidth="8" strokeLinecap="round" /><path d="m28 46 15 4m25-4-15 4" stroke={ink} strokeWidth="4" strokeLinecap="round" />
      <Eyes y={54} /><path d="m44 64 4 3 4-3m-4 3v5m-7 0q7 6 14 0" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
    </>;
    case 4: return <>
      <circle cx="48" cy="50" r="34" fill={main} /><path d="M16 45Q16 15 48 16Q80 16 82 45Q70 42 63 48Q54 41 45 47Q34 42 26 49Q20 43 16 45Z" fill={accent} />
      <circle cx="48" cy="50" r="11" fill="#f9dab0" /><path d="m25 30 5 3m30-5 5-3m-3 9 5 3m-38 25 5-2" stroke="#fff4a4" strokeWidth="4" strokeLinecap="round" />
      <circle cx="34" cy="65" r="3" fill={ink} /><circle cx="62" cy="65" r="3" fill={ink} /><path d="M44 73q4 4 8 0" fill="none" stroke={ink} strokeWidth="3" />
    </>;
    case 5: return <>
      <path d="M17 49Q7 32 25 27Q29 14 45 21Q61 12 69 26Q87 26 80 43Q92 56 76 64Q73 81 57 77Q42 88 32 75Q15 76 17 59Q8 55 17 49Z" fill={main} />
      <circle cx="48" cy="50" r="23" fill={accent} /><Eyes y={46} /><Grin y={65} />
    </>;
    case 6: return <>
      <path d="M38 14Q59 8 65 26Q71 45 62 73Q55 87 40 79Q28 71 32 50Q29 22 38 14Z" fill={main} />
      <path d="M37 17q7-7 16-5" stroke={accent} strokeWidth="6" fill="none" strokeLinecap="round" /><circle cx="38" cy="31" r="2" fill={accent} /><circle cx="61" cy="37" r="2" fill={accent} /><circle cx="38" cy="67" r="2" fill={accent} />
      <Eyes left={42} right={57} y={46} /><path d="M43 61q6 6 12 0" fill="none" stroke={ink} strokeWidth="3" />
    </>;
    case 7: return <>
      <path d="M48 24V13m0 0 8-4" stroke={ink} strokeWidth="4" strokeLinecap="round" /><circle cx="48" cy="12" r="5" fill={accent} />
      <rect x="18" y="27" width="60" height="52" rx="11" fill={main} /><rect x="25" y="37" width="46" height="27" rx="5" fill="#e9f6ff" />
      <path d="m34 46 8 8m0-8-8 8" stroke={accent} strokeWidth="4" /><circle cx="60" cy="50" r="5" fill={accent} /><path d="M41 72h14" stroke={ink} strokeWidth="4" strokeLinecap="round" />
      <path d="M18 45H9m69 0h9" stroke={ink} strokeWidth="5" strokeLinecap="round" />
    </>;
    case 8: return <>
      <path d="M16 69Q11 37 30 28L45 8 53 27Q79 29 82 61Q70 83 48 83Q28 83 16 69Z" fill={main} />
      <path d="M24 59q23 23 49 0v11Q50 88 24 70Z" fill="#fff" /><path d="m31 63 5 7 5-6 6 8 6-8 6 7 6-8" fill="none" stroke={ink} strokeWidth="2" />
      <Eyes left={36} right={61} y={47} /><path d="M15 61 5 52m77 9 9-9" stroke={accent} strokeWidth="7" strokeLinecap="round" />
    </>;
    case 9: return <>
      <path d="M35 45h26l5 34H30Z" fill={main} /><path d="M12 46Q16 13 48 13Q80 13 84 46Q51 57 12 46Z" fill={accent} />
      <circle cx="34" cy="27" r="6" fill="#fff6e6" /><circle cx="57" cy="21" r="7" fill="#fff6e6" /><circle cx="67" cy="39" r="5" fill="#fff6e6" />
      <Eyes y={59} /><Grin y={73} />
    </>;
    case 10: return <>
      <path d="M27 38Q24 15 49 17Q74 17 73 42Q82 65 61 79Q42 88 28 70Q16 55 27 38Z" fill={main} />
      <path d="M38 58q10-11 20 0l-6 13H43Z" fill={accent} /><Eyes y={43} /><path d="M34 18q1-10 10-10" stroke={main} strokeWidth="7" strokeLinecap="round" />
      <path d="M20 60q-12-3-11-15m65 13q12-3 11-15" stroke={accent} strokeWidth="6" strokeLinecap="round" />
    </>;
    case 11: return <>
      <path d="M62 11Q32 12 23 42Q17 67 42 79Q61 88 78 66Q49 74 40 53Q30 30 62 11Z" fill={main} />
      <circle cx="49" cy="37" r="3" fill={accent} /><circle cx="61" cy="51" r="4" fill={accent} /><path d="M17 17v10m-5-5h10M77 14v9m-4-4h8" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <Eyes left={34} right={49} y={51} sleepy /><path d="M36 65q5 4 9 0" fill="none" stroke={ink} strokeWidth="3" />
    </>;
    case 12: return <>
      <path d="M17 75V44Q17 17 48 16Q79 17 79 44v31l-10-7-10 10-11-8-11 8-10-10Z" fill={main} />
      <circle cx="37" cy="48" r="7" fill={ink} /><circle cx="60" cy="48" r="7" fill={ink} /><ellipse cx="49" cy="67" rx="5" ry="8" fill={ink} />
      <circle cx="35" cy="45" r="2" fill="#fff" /><circle cx="58" cy="45" r="2" fill="#fff" /><path d="m20 24-8-8m68 8 8-8" stroke={accent} strokeWidth="4" strokeLinecap="round" />
    </>;
    case 13: return <>
      <path d="M42 25q-6-13 4-16 7-1 7 10 8-12 14-5 5 7-5 16" fill={accent} />
      <path d="M19 48Q18 25 47 23Q77 22 77 51Q77 78 50 82Q24 79 19 48Z" fill={main} />
      <path d="M36 59q12-8 24 0L49 70Z" fill="#f6ad57" /><Eyes y={45} /><path d="m26 38 16 4m28-4-16 4" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M25 71 13 78m58-7 12 7" stroke={accent} strokeWidth="5" strokeLinecap="round" />
    </>;
    case 14: return <>
      <path d="M18 54Q17 28 35 22L30 11 45 22Q64 17 75 35Q87 61 70 76Q52 88 31 77Q18 70 18 54Z" fill={main} />
      <circle cx="48" cy="32" r="8" fill="#fff" /><circle cx="48" cy="32" r="3" fill={ink} /><Eyes y={53} /><path d="M38 67q10 11 20 0" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
      <path d="m18 42-10-5m69 4 11-4" stroke={accent} strokeWidth="6" strokeLinecap="round" />
    </>;
    case 15: return <>
      <path d="M15 53Q15 19 48 17Q81 19 81 53Q81 81 48 82Q15 81 15 53Z" fill={main} />
      <path d="M18 43q30-12 60 0v20q-30 12-60 0Z" fill="#fff0d8" /><path d="M16 34q32-11 64 0" stroke={accent} strokeWidth="7" />
      <Eyes y={52} sleepy /><path d="M44 67q4 4 8 0" stroke={ink} strokeWidth="3" fill="none" /><path d="M76 32q11 0 14 10" stroke={main} strokeWidth="6" fill="none" />
    </>;
    case 16: return <>
      <path d="M28 45q20-14 40 0l8 22q-9 16-28 16T20 67Z" fill={main} />
      <path d="M30 46 22 23m44 23 8-23" stroke={ink} strokeWidth="5" /><circle cx="22" cy="21" r="9" fill="#fff" /><circle cx="74" cy="21" r="9" fill="#fff" /><circle cx="23" cy="22" r="4" fill={ink} /><circle cx="73" cy="22" r="4" fill={ink} />
      <path d="M22 57Q4 49 10 36l14 5M74 57q18-8 12-21l-14 5" fill={accent} /><path d="m31 60 12 3m22-3-12 3" stroke={ink} strokeWidth="4" strokeLinecap="round" /><path d="M43 71h10" stroke={ink} strokeWidth="3" />
    </>;
    case 17: return <>
      <path d="M23 37 17 76q31 15 62 0l-6-39Z" fill={accent} /><path d="M38 39v42m20-42v42" stroke="#fff5df" strokeWidth="9" />
      <path d="M24 40Q10 35 20 25Q15 15 29 16Q31 7 43 13Q53 4 62 14Q77 12 78 25Q90 36 73 41Z" fill={main} />
      <circle cx="34" cy="31" r="3" fill="#f4d46e" /><circle cx="62" cy="28" r="3" fill="#f4d46e" /><Eyes y={56} /><Grin y={72} />
    </>;
    case 18: return <>
      <circle cx="20" cy="44" r="14" fill="#64cbe3" /><circle cx="76" cy="44" r="14" fill="#a59ae9" /><ellipse cx="48" cy="51" rx="28" ry="32" fill={main} />
      <path d="M31 27q17-15 34 0" fill="none" stroke={accent} strokeWidth="9" strokeLinecap="round" /><Eyes y={48} /><circle cx="48" cy="60" r="7" fill={accent} /><path d="M38 72q10 11 20 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M30 36q6-5 12 0m12 0q6-5 12 0" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
    </>;
    default: return <>
      <path d="m19 43 1-18 11 7 5-17 13 13 12-14 5 19 14-8-3 23Q87 72 66 80Q40 89 24 73Q16 62 19 43Z" fill={main} />
      <path d="m21 29 10 8m7-18 10 14m15-14-9 15m23-5-13 10" stroke={accent} strokeWidth="7" strokeLinecap="round" />
      <Eyes y={49} /><path d="M37 64q11 11 22 0" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" /><path d="m40 66 4 6 4-5 4 5 4-6" fill="#fff" />
    </>;
  }
}

export function PlayerAvatar({ id, size = 42 }: { id: number; size?: number }) {
  const index = avatarId(id) - 1;
  const avatar = AVATARS[index];

  return <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={`Avatar ${avatar.name}`} style={{ flex: 'none' }}>
    <rect width="96" height="96" rx="25" fill={avatar.backdrop} />
    <circle cx="76" cy="17" r="9" fill="#fff" opacity=".4" />
    <g stroke={ink} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round"><Character index={index} main={avatar.main} accent={avatar.accent} /></g>
  </svg>;
}
