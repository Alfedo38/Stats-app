/** @type {import('next').NextConfig} */
const nextConfig = {
  // Le decimos a Vercel que ignore los errores de TypeScript al compilar
  typescript: {
    ignoreBuildErrors: true,
  },
  // Y que también ignore las advertencias de ESLint
  eslint: {
    ignoreDuringBuilds: true,
  },
  // La Lista VIP para las imágenes (Logos de NBA y ESPN)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.nba.com',
      },
      {
        protocol: 'https',
        hostname: 'a.espncdn.com',
      },
    ],
  },
};

export default nextConfig;