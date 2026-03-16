import type { Metadata } from 'next';
import { Inter, Oswald } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';

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
      <body className="bg-black text-neutral-200 antialiased selection:bg-[#10b981]/30 font-sans min-h-screen flex">
        
        {/* Aquí inyectamos el Sidebar */}
        <Sidebar />

        {/* El contenedor principal del contenido. 
          Usamos md:pl-64 para empujar el contenido hacia la derecha 
          y dejarle espacio al menú lateral en pantallas grandes.
        */}
        <div className="flex-1 md:pl-64 min-h-screen">
          {children}
        </div>

      </body>
    </html>
  );
}