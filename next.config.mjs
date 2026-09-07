/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  outputFileTracingIncludes: {'/api/admin/database/bootstrap':['./db/migrations/**/*']}
};
export default nextConfig;
