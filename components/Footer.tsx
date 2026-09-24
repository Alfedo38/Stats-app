import Link from 'next/link';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg)] py-8 mt-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center md:items-start gap-6">
        
        {/* IZQUIERDA: Marca y Copyright */}
        <div className="text-center md:text-left">
          <h2 className="text-xl font-black italic tracking-tighter uppercase text-[var(--text)] mb-2">
            Mosk<span className="text-[#10b981]">Props</span>
          </h2>
          <p className="text-[var(--text-muted)] text-[10px] uppercase tracking-widest font-bold">
            © {currentYear} MoskProps Analytics. Todos los derechos reservados.
          </p>
        </div>

        {/* Disclaimer de uso responsable */}
        <div className="text-center md:text-right max-w-sm">
          <p className="text-[var(--text-muted)] text-[9px] uppercase tracking-wider leading-relaxed">
            <span className="text-red-500 font-bold">⚠️ Atención:</span> MoskProps es una herramienta de análisis estadístico. No somos una casa de apuestas ni ofrecemos asesoramiento financiero. Jugá con responsabilidad. +18.
          </p>
        </div>

      </div>
    </footer>
  );
}
