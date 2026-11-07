export default function Icon({ name, size = 20 }: { name: "arrow" | "music" | "pause" | "plus" | "close" | "check" | "back" | "copy"; size?: number }) {
  const paths = { arrow: "M4 12h16m-6-6 6 6-6 6", back: "M20 12H4m6-6-6 6 6 6", music: "M9 18V5l11-2v13M9 8l11-2M9 18c0 2-5 3-5 0s5-3 5 0Zm11-2c0 2-5 3-5 0s5-3 5 0Z", pause: "M9 5v14M15 5v14", plus: "M12 5v14M5 12h14", close: "m6 6 12 12M6 18 18 6", check: "m5 12 4 4L19 6", copy: "M8 8h12v13H8zM16 8V3H3v13h5" };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
