import type { Metadata } from 'next';
import { Inter, Oswald } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer'; // 🔥 1. Importamos el Footer

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

        {/* 
          🔥 2. Le agregamos 'flex flex-col' al contenedor principal 
          para que pueda empujar el Footer hacia abajo.
        */}
       <div className="flex-1 md:pl-64 pt-16 md:pt-0 min-h-screen flex flex-col">
          
          {/* 🔥 3. Envolvemos a los children con 'flex-grow' */}
          <div className="flex-grow">
            {children}
          </div>

          {/* 🔥 4. Inyectamos el Footer al final de la columna */}
          <Footer />
          
        </div>

      </body>
    </html>
  );
}