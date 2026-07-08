import type { SVGProps } from "react";

/*
  Inline-SVG icon set (stroke style, 24px grid) — crisp, consistent, zero deps.
  Add new glyphs to PATHS. Filled glyphs go in FILLED.
*/

const PATHS: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  search: "M21 21l-4.3-4.3M11 19a8 8 0 100-16 8 8 0 000 16z",
  filter: "M3 4h18l-7 8v6l-4 2v-8z",
  download: "M12 3v12m0 0l-4-4m4 4l4-4M4 21h16",
  upload: "M12 21V9m0 0l-4 4m4-4l4 4M4 3h16",
  refresh: "M4 4v6h6M20 20v-6h-6M20 9a8 8 0 00-14.9-3M4 15a8 8 0 0014.9 3",
  columns: "M4 5h16v14H4zM12 5v14",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 016 0v3",
  trash: "M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v12a1 1 0 01-1 1H7a1 1 0 01-1-1V7",
  copy: "M9 9h10v10H9zM5 15V5h10",
  edit: "M4 20h4L18.5 9.5a2.1 2.1 0 00-3-3L5 17v3z",
  duplicate: "M8 8h11v11H8zM4 4h11v3M4 4v11h3",
  star: "M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z",
  "star-filled": "M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z",
  pin: "M9 4h6l-1 6 3 3v2H7v-2l3-3z M12 15v5",
  "pin-filled": "M9 4h6l-1 6 3 3v2H7v-2l3-3z M12 15v5",
  "chevron-left": "M15 6l-6 6 6 6",
  "chevron-right": "M9 6l6 6-6 6",
  "chevron-down": "M6 9l6 6 6-6",
  "chevron-up": "M6 15l6-6 6 6",
  "chevrons-left": "M17 6l-6 6 6 6M11 6l-6 6 6 6",
  "chevrons-right": "M7 6l6 6-6 6M13 6l6 6-6 6",
  "arrow-right": "M5 12h14M13 6l6 6-6 6",
  sort: "M8 9l4-4 4 4M8 15l4 4 4-4",
  "arrow-up": "M12 19V5M6 11l6-6 6 6",
  "arrow-down": "M12 5v14M6 13l6 6 6-6",
  alert: "M12 9v4m0 4h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6A2 2 0 0022 18L13.7 3.9a2 2 0 00-3.4 0z",
  ledger: "M5 4h11a2 2 0 012 2v14H7a2 2 0 01-2-2zM9 8h6M9 12h6M9 16h4",
  activity: "M3 12h4l3 8 4-16 3 8h4",
  more: "M6 12h.01M12 12h.01M18 12h.01",
  "dots-vertical": "M12 6h.01M12 12h.01M12 18h.01",
  check: "M5 13l4 4L19 7",
  x: "M6 18L18 6M6 6l12 12",
  sun: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.7 5.7l1.4 1.4M4.9 4.9l1.4 1.4m0 11.4l-1.4 1.4M19.1 4.9l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z",
  moon: "M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z",
  sparkles: "M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  printer: "M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 9a3 3 0 100 6 3 3 0 000-6z",
  wallet: "M3 7h15a2 2 0 012 2v8a2 2 0 01-2 2H4a1 1 0 01-1-1zM3 7V5a1 1 0 011-1h12v3M17 13h.01",
  receipt: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM8 8h8M8 12h8M8 16h5",
  scale: "M12 3v18M6 21h12M12 6l-6 2 2 5a3 3 0 01-4 0l2-5zm0 0l6 2-2 5a3 3 0 004 0l-2-5z",
  "trending-up": "M3 17l6-6 4 4 8-8M15 7h6v6",
  "trending-down": "M3 7l6 6 4-4 8 8M15 17h6v-6",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  home: "M4 11l8-7 8 7M6 10v9h12v-9",
  users: "M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 20v-1a4 4 0 00-3-3.9M16 4.1a4 4 0 010 7.8",
  "file-text": "M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6",
  bell: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.5 21a1.7 1.7 0 003 0",
  building: "M4 21V4a1 1 0 011-1h9a1 1 0 011 1v17M15 8h4a1 1 0 011 1v12M8 7h2M8 11h2M8 15h2",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  grip: "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
  "panel-left": "M4 4h16v16H4zM10 4v16",
  tag: "M3 12l9-9 8 8-9 9zM7.5 7.5h.01",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  "map-pin": "M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z M12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  briefcase: "M4 8h16v12H4zM9 8V5h6v3M4 13h16",
  hash: "M9 4L7 20M17 4l-2 16M4 9h16M4 15h16",
  book: "M5 4h13a1 1 0 011 1v15H7a2 2 0 00-2 2zM5 4v16",
  coins: "M8 8a5 3 0 1010 0 5 3 0 10-10 0v6a5 3 0 0010 0M4 11a5 3 0 1010 0 5 3 0 10-10 0v6a5 3 0 0010 0",
  bank: "M3 10l9-6 9 6M5 10v9M19 10v9M9 10v9M15 10v9M3 21h18M3 10h18",
  note: "M5 3h11l4 4v14H5zM15 3v5h5",
  save: "M5 3h12l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7",
  reset: "M4 4v6h6M4 10a8 8 0 118 10",
  "chart-bar": "M4 20V10M10 20V4M16 20v-8M22 20H2",
};

const FILLED = new Set(["star-filled", "pin-filled"]);

export function Icon({ name, ...props }: { name: string } & SVGProps<SVGSVGElement>) {
  const d = PATHS[name] ?? PATHS.alert;
  const filled = FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 1 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={d} />
    </svg>
  );
}
