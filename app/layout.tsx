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
    <html lang="en">
      {/* Inline script: sets theme class before first paint to avoid flash */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = localStorage.getItem('theme');
              var d = t ? t === 'dark' : true; // default: dark
              if (d) document.documentElement.classList.add('dark');
            } catch(e){}
          })();
        `}} />
      </head>
      <body className="min-h-screen antialiased bg-app text-base">
        <QueryProvider>
          <Navbar />
          <main className="px-4 sm:px-6 lg:px-8 py-6 max-w-screen-2xl mx-auto">
            {children}
          </main>
        </QueryProvider>
      </body>
    </html>
  );
}
