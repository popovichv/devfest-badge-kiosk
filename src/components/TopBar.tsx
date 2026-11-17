import type { ReactNode } from 'react';

export type AppView = 'kiosk' | 'roster' | 'tickets';

interface TopBarProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  onResetKiosk: () => void;
  kioskBusy: boolean;
}

export function TopBar({
  activeView,
  onSelectView,
  onResetKiosk,
  kioskBusy,
}: TopBarProps): ReactNode {
  const navItems: Array<{ id: AppView; label: string }> = [
    { id: 'kiosk', label: 'Check-In Kiosk' },
    { id: 'roster', label: 'Desk Roster' },
    { id: 'tickets', label: 'Ticket QR Builder' },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-3.5">
        <a
          href="#kiosk"
          onClick={(e) => {
            e.preventDefault();
            onSelectView('kiosk');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          DevFest Check-In
        </a>

        <nav className="flex items-center gap-6" aria-label="Primary navigation">
          {navItems.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded ${
                  active
                    ? 'text-slate-900'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[15px] h-0.5 bg-blue-600"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onResetKiosk}
            className="min-h-[40px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            {kioskBusy ? 'New Scan' : 'Test Print'}
          </button>
        </div>
      </div>
    </header>
  );
}
