export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      WebkitOverflowScrolling: 'touch' as const,
      background: '#050508',
    }}>
      {children}
    </div>
  );
}
