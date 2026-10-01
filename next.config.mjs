/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Room for attendance spreadsheets (the upload action itself caps files at 5 MB)
      bodySizeLimit: '6mb',
    },
  },
};
export default nextConfig;
