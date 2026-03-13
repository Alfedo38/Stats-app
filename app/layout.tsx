import type { Metadata } from 'next';
import { Inter, Oswald } from 'next/font/google';
import './globals.css';

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
  title: 'MoskProps | Análisis de la NBA',
  description: 'Proyecciones y estadísticas avanzadas de la NBA',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${oswald.variable} dark`}>
      <body className="bg-black text-neutral-200 antialiased selection:bg-emerald-500/30 font-sans min-h-screen">
        {children}
      </body>
    </html>
  );
}