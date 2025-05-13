// Vercel configuration for NestTask
module.exports = {
  cleanUrls: true,
  trailingSlash: false,
  
  headers: [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
      ],
    },
    {
      // Special headers for analytics endpoints to prevent blocking
      source: '/_vercel/insights/(.*)',
      headers: [
        {
          key: 'Access-Control-Allow-Origin',
          value: '*',
        },
        {
          key: 'Cache-Control',
          value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      ],
    },
  ],
  
  rewrites: [
    // SPA rewrite for client-side routing
    {
      source: '/((?!api|_vercel|[\\w-]+\\.[\\w-]+).*)',
      destination: '/index.html',
    },
  ],
}; 
 