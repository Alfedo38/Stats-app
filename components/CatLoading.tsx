import styles from './CatLoading.module.css';

type Props = { title?: string; description?: string; overlay?: boolean };

export default function CatLoading({ title = 'Preparando la comparativa', description = 'Estamos reuniendo los equipos y sus estadísticas.', overlay = false }: Props) {
  return <div className={`${styles.shell} ${overlay ? styles.overlay : ''}`} role="status" aria-live="polite" aria-busy="true">
    <div className={styles.card}>
      <div className={styles.illustration} aria-hidden="true">
        <svg viewBox="0 0 260 210" fill="none">
          <ellipse cx="130" cy="182" rx="87" ry="8" className={styles.shadow} />
          <path d="M172 160C218 165 220 120 204 119C191 118 204 147 174 143" stroke="#d89760" strokeWidth="17" strokeLinecap="round" className={styles.tail} />
          <g className={styles.cat}>
            <path d="M80 175C73 151 78 116 99 105H151C174 117 177 150 169 175Z" fill="#e8ad75" />
            <ellipse cx="124" cy="150" rx="24" ry="29" fill="#f8d6ad" />
            <path d="M77 73L78 29L106 50C118 46 133 46 145 51L172 29L174 78C181 92 172 112 158 118C137 128 104 126 86 114C73 105 68 87 77 73Z" fill="#edb67f" stroke="#d89760" strokeWidth="2" strokeLinejoin="round" />
            <path d="M85 62L86 43L99 55M151 56L164 43L165 65" fill="#e7958c" />
            <path d="M91 85C95 81 101 81 105 85M141 85C145 81 151 81 155 85" stroke="#483729" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M118 94L126 94L122 99Z" fill="#b66665" />
            <path d="M122 100C121 108 112 108 110 103M122 100C123 108 132 108 134 103" stroke="#8c604a" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M83 95L63 91M84 103L64 105M160 95L181 91M159 103L179 106" stroke="#b78259" strokeWidth="2" strokeLinecap="round" />
            <path d="M104 51L108 65M121 48L122 62M138 51L135 65" stroke="#d89760" strokeWidth="5" strokeLinecap="round" />
            <ellipse cx="98" cy="174" rx="19" ry="9" fill="#f8d6ad" />
            <path d="M151 144C166 144 175 153 185 157" stroke="#f8d6ad" strokeWidth="15" strokeLinecap="round" className={styles.paw} />
          </g>
          <g className={styles.ball}>
            <circle cx="204" cy="169" r="17" fill="#ed9256" stroke="#b96e42" strokeWidth="2" />
            <path d="M187 169H221M204 152V186M192 157C205 162 205 177 192 181M216 157C203 162 203 177 216 181" stroke="#9d5d39" strokeWidth="1.5" />
          </g>
          <path d="M48 62V73M43 67H54M204 61V70M200 65H209" stroke="var(--brand, #10b981)" strokeWidth="2" strokeLinecap="round" className={styles.sparkle} />
        </svg>
      </div>
      <span className={styles.eyebrow}>Un momento</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
    </div>
  </div>;
}
