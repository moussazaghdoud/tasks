export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <circle cx="9" cy="11" r="6.4" fill="none" stroke="var(--color-ink)" strokeWidth="1.8" />
      <circle cx="15.2" cy="4.8" r="2.7" fill="var(--color-accent)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <BrandMark />
      <span className="font-serif text-[21px] leading-none tracking-[-0.01em] text-ink">Hence</span>
    </span>
  );
}
