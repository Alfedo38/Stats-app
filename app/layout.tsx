import type { Metadata } from 'next';
import { Inter, Oswald } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const oswald = Oswald({
  subsets: ['latin'],
  variable: '--font-oswald',
  display: 'swap',
});

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning className={`${inter.variable} ${oswald.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-[var(--bg)] text-[var(--text)] antialiased selection:bg-[#10b981]/30 font-sans min-h-screen flex">
        <Sidebar />

        <div
          className="flex-1 md:pl-64 min-h-screen flex flex-col"
          style={{ paddingTop: 'var(--topbar-height, 0px)' }}
        >
          <div className="md:pt-0 flex-grow">
            {children}
          </div>

          <Footer />
        </div>
      </body>
    </html>
  );
}
