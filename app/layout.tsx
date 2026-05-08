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
    // ✅ template permite que cada página defina su propio título
    // sin repetir "| MoskProps" en cada archivo manualmente.
    // Si una página exporta: export const metadata = { title: 'Injury Report' }
    // el título final será: "Injury Report | MoskProps"
    // Si no exporta metadata, usa el default.
    template: '%s | MoskProps',
    default: 'MoskProps — Análisis NBA',
  },
  description: 'Proyecciones, estadísticas avanzadas y análisis cuantitativo de la NBA.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${oswald.variable} dark`}>
      <body className="bg-black text-neutral-200 antialiased selection:bg-[#10b981]/30 font-sans min-h-screen flex">

        <Sidebar />

        {/*
          ✅ FIX: Reemplazamos pt-16 hardcodeado por una variable CSS.
          La variable --topbar-height se define en globals.css y la usa
          tanto el layout como el Sidebar para la top bar mobile.
          Si la altura de la top bar cambia, se actualiza en un solo lugar.
        */}
        <div
          className="flex-1 md:pl-64 min-h-screen flex flex-col"
          style={{ paddingTop: 'var(--topbar-height, 0px)' }}
        >
          {/* En desktop no hay top bar, el padding es 0.
              En mobile, la variable CSS toma el valor definido en globals.css */}
          <div className="md:pt-0 flex-grow">
            {children}
          </div>

          <Footer />
        </div>

      </body>
    </html>
  );
}