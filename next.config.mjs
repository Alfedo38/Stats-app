/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mantener en true hasta terminar la limpieza TypeScript global del proyecto.
  // Cuando `npm run build` no muestre errores de tipos, cambiar ambos a false.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.thesportsdb.com',
      },
      {
        protocol: 'https',
        hostname: 'a.espncdn.com',
      },
    ],
  },
};

export default nextConfig;
