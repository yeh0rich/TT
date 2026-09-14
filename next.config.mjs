/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdfjs-dist"],
    // pdfjs-dist resolves its worker file through a computed path
    // (`GlobalWorkerOptions.workerSrc`), not a literal import string, so
    // Vercel's output file tracing can't see the dependency on its own and
    // omits the 2.3MB worker file from the serverless bundle. Force it in.
    outputFileTracingIncludes: {
      "/api/ingest": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    },
  },
};

export default nextConfig;
