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
};

export default nextConfig;