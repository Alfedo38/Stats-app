import type { Metadata } from 'next';
import './globals.css';
import './player-page-polish.css';
import AppChrome from '@/components/auth/AppChrome';
import { getSession } from '@/lib/auth/server';
import './auth.css';

export const metadata: Metadata = {
  title: {
    template: '%s | MoskProps',
    default: 'MoskProps — Análisis NBA',
  },
  description: 'Proyecciones, estadísticas avanzadas y análisis cuantitativo de la NBA.',
};

const themeInitScript = `
(function () {
  try {
    var theme = window.localStorage.getItem('theme');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-[var(--bg)] text-[var(--text)] antialiased selection:bg-[#10b981]/30 font-sans min-h-screen flex">
        <AppChrome user={user}>{children}</AppChrome>
      </body>
    </html>
  );
}
