'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowDownUp, AlertTriangle, Settings } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/',         label: 'Dashboard', icon: LayoutDashboard },
  { href: '/torrents', label: 'Torrents',  icon: ArrowDownUp      },
  { href: '/issues',   label: 'Issues',    icon: AlertTriangle    },
  { href: '/settings', label: 'Settings',  icon: Settings         },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b bg-surface/80 backdrop-blur-md border-default">
      <div className="px-4 sm:px-6 lg:px-8 max-w-screen-2xl mx-auto flex h-14 items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-lg font-bold tracking-tight text-base">
            Anal<span className="text-blue-500 dark:text-blue-400">ys</span>arr
          </span>
        </Link>

        {/* Nav + theme toggle */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'text-gray-900 dark:text-white bg-gray-100 dark:bg-zinc-800'
                    : 'text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-800/60'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}

          <div className="ml-1 h-5 w-px bg-gray-200 dark:bg-zinc-700" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
