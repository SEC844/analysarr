import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { QueryProvider } from '@/components/QueryProvider';

export const metadata: Metadata = {
  title: 'Analysarr — Media Stack Dashboard',
  description: 'Real-time overview of your Radarr, Sonarr and qBittorrent stack.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <QueryProvider>
          <Navbar />
          <main className="px-4 sm:px-6 lg:px-8 py-6">{children}</main>
        </QueryProvider>
      </body>
    </html>
  );
}
