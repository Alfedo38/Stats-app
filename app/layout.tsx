import type { Metadata } from 'next';
import { Inter, Oswald } from 'next/font/google';
import './globals.css';

// Fuente para textos normales
const inter = Inter({ 
  subsets: ['latin'], 
  variable: '--font-inter',
  display: 'swap',
});

// Fuente deportiva/agresiva para Títulos y Números (Estilo ESPN/Prop.cash)
const oswald = Oswald({ 
  subsets: ['latin'], 
  variable: '--font-oswald',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MoskProps | Análisis de la NBA',
  description: 'Proyecciones y estadísticas avanzadas de la NBA',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${oswald.variable}`}>
      <body className="bg-[#050505] text-neutral-200 antialiased selection:bg-emerald-500/30 font-sans">
        {children}
      </body>
    </html>
  );
}