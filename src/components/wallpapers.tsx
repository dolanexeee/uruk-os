import React from "react";

/**
 * Wallpapers for Uruk OS — five ORIGINAL vector scenes drawn for this
 * project (Mesopotamian-inspired landscapes: a ziggurat at dusk, the two
 * rivers, desert dunes, a palm grove at night, and an aurora). No photo
 * or artwork from any other source is used.
 */

function Scene({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <svg
      key={id}
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function ZigguratWallpaper() {
  return (
    <Scene id="ziggurat">
      <defs>
        <linearGradient id="wp-z-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d1440" />
          <stop offset="0.45" stopColor="#6d3b8a" />
          <stop offset="0.75" stopColor="#e2603f" />
          <stop offset="1" stopColor="#f7a54b" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#wp-z-sky)" />
      <circle cx="1130" cy="600" r="120" fill="#ffd97a" opacity="0.9" />
      <circle cx="1130" cy="600" r="190" fill="#ffd97a" opacity="0.18" />
      <g fill="#ffffff">
        <circle cx="180" cy="120" r="2.4" />
        <circle cx="420" cy="80" r="1.8" />
        <circle cx="760" cy="150" r="2.2" />
        <circle cx="1290" cy="90" r="2" />
        <circle cx="1480" cy="200" r="1.7" />
        <circle cx="980" cy="70" r="1.6" />
      </g>
      <polygon points="0,1000 420,700 900,1000" fill="#31184a" />
      <polygon points="600,1000 1120,660 1600,1000" fill="#241138" />
      <g fill="#160a2b">
        <rect x="560" y="730" width="480" height="60" />
        <rect x="610" y="672" width="380" height="58" />
        <rect x="665" y="616" width="270" height="56" />
        <rect x="715" y="562" width="170" height="54" />
        <rect x="762" y="512" width="76" height="50" />
      </g>
      <rect x="790" y="470" width="20" height="44" fill="#160a2b" />
      <rect y="790" width="1600" height="210" fill="#0d0619" />
    </Scene>
  );
}

export function RiversWallpaper() {
  return (
    <Scene id="rivers">
      <defs>
        <linearGradient id="wp-r-land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe3a8" />
          <stop offset="1" stopColor="#7fa653" />
        </linearGradient>
        <linearGradient id="wp-r-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fc8e8" />
          <stop offset="1" stopColor="#2f7fc4" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#wp-r-land)" />
      <path d="M330,-20 C420,240 180,430 350,640 C500,825 380,940 430,1020 L610,1020 C560,900 700,760 560,560 C430,375 640,220 560,-20 Z" fill="url(#wp-r-water)" opacity="0.92" />
      <path d="M1010,-20 C1090,200 900,420 1060,640 C1190,815 1090,940 1130,1020 L1300,1020 C1250,900 1360,760 1240,565 C1130,385 1310,210 1240,-20 Z" fill="url(#wp-r-water)" opacity="0.92" />
      <g fill="#5d8a3c" opacity="0.55">
        <circle cx="180" cy="300" r="70" />
        <circle cx="820" cy="220" r="90" />
        <circle cx="1450" cy="420" r="80" />
        <circle cx="760" cy="760" r="100" />
        <circle cx="150" cy="820" r="85" />
      </g>
      <circle cx="1380" cy="140" r="64" fill="#fff3b0" />
      <circle cx="1380" cy="140" r="100" fill="#fff3b0" opacity="0.3" />
    </Scene>
  );
}

export function DunesWallpaper() {
  return (
    <Scene id="dunes">
      <defs>
        <linearGradient id="wp-d-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe8c2" />
          <stop offset="1" stopColor="#ffb26b" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#wp-d-sky)" />
      <circle cx="800" cy="430" r="150" fill="#ffdf8e" />
      <circle cx="800" cy="430" r="230" fill="#ffdf8e" opacity="0.3" />
      <path d="M0,560 C300,470 560,640 900,570 C1200,510 1400,610 1600,540 L1600,1000 L0,1000 Z" fill="#e8975a" />
      <path d="M0,680 C260,600 620,740 980,670 C1250,618 1440,700 1600,650 L1600,1000 L0,1000 Z" fill="#d17f3e" />
      <path d="M0,820 C300,745 700,860 1050,800 C1300,758 1480,820 1600,790 L1600,1000 L0,1000 Z" fill="#b56527" />
      <path d="M900,570 C1200,510 1400,610 1600,540" stroke="#ffd9a0" strokeWidth="5" fill="none" opacity="0.7" />
    </Scene>
  );
}

export function PalmNightWallpaper() {
  return (
    <Scene id="palm-night">
      <defs>
        <linearGradient id="wp-p-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#060913" />
          <stop offset="0.7" stopColor="#0f2038" />
          <stop offset="1" stopColor="#1d3a5f" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#wp-p-sky)" />
      <g fill="#ffffff">
        {Array.from({ length: 90 }, (_, i) => (
          <circle
            key={i}
            cx={(i * 173) % 1600}
            cy={(i * 97) % 520}
            r={i % 5 === 0 ? 2.2 : 1.2}
            opacity={0.35 + ((i * 13) % 60) / 100}
          />
        ))}
      </g>
      <circle cx="1270" cy="180" r="74" fill="#f4f1de" />
      <circle cx="1240" cy="160" r="66" fill="#0b1626" opacity="0.28" />
      <rect y="830" width="1600" height="170" fill="#04070f" />
      <g stroke="#04070f" fill="#04070f">
        <path d="M240,850 C250,700 246,640 230,540 L252,540 C262,650 262,730 268,850 Z" />
        <g strokeWidth="13" strokeLinecap="round" fill="none">
          <path d="M242,545 C180,505 120,505 70,540" />
          <path d="M242,545 C290,495 350,490 400,515" />
          <path d="M242,545 C225,485 185,455 140,450" />
          <path d="M242,545 C270,482 315,455 360,458" />
          <path d="M242,545 C242,495 225,460 195,435" />
        </g>
        <path d="M1330,850 C1340,730 1336,680 1322,600 L1342,600 C1352,690 1352,760 1356,850 Z" />
        <g strokeWidth="11" strokeLinecap="round" fill="none">
          <path d="M1332,605 C1280,570 1230,568 1185,598" />
          <path d="M1332,605 C1375,562 1425,558 1470,580" />
          <path d="M1332,605 C1318,552 1285,528 1248,522" />
          <path d="M1332,605 C1358,550 1395,528 1432,532" />
        </g>
      </g>
    </Scene>
  );
}

export function AuroraWallpaper() {
  return (
    <Scene id="aurora">
      <defs>
        <linearGradient id="wp-a-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#020617" />
          <stop offset="0.6" stopColor="#0b2545" />
          <stop offset="1" stopColor="#13315c" />
        </linearGradient>
        <linearGradient id="wp-a-band1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#34f5a2" stopOpacity="0" />
          <stop offset="0.3" stopColor="#34f5a2" stopOpacity="0.75" />
          <stop offset="0.7" stopColor="#38bdf8" stopOpacity="0.65" />
          <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="wp-a-band2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a78bfa" stopOpacity="0" />
          <stop offset="0.5" stopColor="#f472b6" stopOpacity="0.5" />
          <stop offset="1" stopColor="#34f5a2" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#wp-a-sky)" />
      <g fill="#ffffff">
        {Array.from({ length: 120 }, (_, i) => (
          <circle
            key={i}
            cx={(i * 137) % 1600}
            cy={(i * 61) % 620}
            r={i % 7 === 0 ? 2 : 1.1}
            opacity={0.3 + ((i * 7) % 65) / 100}
          />
        ))}
      </g>
      <path d="M-50,420 C350,240 620,470 980,300 C1250,175 1450,330 1650,230 L1650,60 C1400,170 1180,60 900,170 C600,285 320,90 -50,210 Z" fill="url(#wp-a-band1)" />
      <path d="M-50,560 C400,400 700,600 1080,440 C1330,335 1500,450 1650,380 L1650,250 C1420,330 1200,250 950,345 C650,460 350,300 -50,400 Z" fill="url(#wp-a-band2)" />
      <polygon points="0,1000 380,760 760,1000" fill="#04101f" />
      <polygon points="520,1000 1020,720 1600,1000" fill="#020a16" />
      <g fill="#e8f6ff">
        <polygon points="352,782 380,760 408,782 392,782 380,772 368,782" />
        <polygon points="985,748 1020,720 1055,748 1035,748 1020,734 1005,748" />
      </g>
    </Scene>
  );
}

export interface WallpaperDef {
  id: string;
  name: string;
  Component: () => React.JSX.Element;
}

export const WALLPAPERS: WallpaperDef[] = [
  { id: "ziggurat", name: "Ziggurat at Dusk", Component: ZigguratWallpaper },
  { id: "rivers", name: "The Two Rivers", Component: RiversWallpaper },
  { id: "dunes", name: "Desert Dunes", Component: DunesWallpaper },
  { id: "palm-night", name: "Palm Night", Component: PalmNightWallpaper },
  { id: "aurora", name: "Northern Lights", Component: AuroraWallpaper },
];

export function WallpaperById({ id }: { id: string }) {
  const def = WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0];
  const C = def.Component;
  return <C />;
}
