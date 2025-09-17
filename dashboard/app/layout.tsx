import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pumpstreams Dashboard',
  description: 'Live Pump.fun livestream analytics',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
