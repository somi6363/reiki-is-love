// Reiki is Love — Nuxt configuration
//
// Decisions worth knowing before editing:
//
// * ssr stays ON. The app must paint content on a cold launch (including inside
//   an Android TWA shell) before JS boots, and Persian content should be
//   crawlable/shareable.
// * Nitro preset 'node-server' because there is a real database. A static or
//   edge preset cannot run node:sqlite.
// * No UI framework. The visual identity in the brief is specific enough that
//   a component library would be fought rather than used; assets/css/main.css
//   holds the tokens instead.

export default defineNuxtConfig({
  compatibilityDate: '2026-08-29',

  modules: ['@vite-pwa/nuxt'],

  css: ['~/assets/css/fonts.css', '~/assets/css/main.css'],

  nitro: {
    preset: 'node-server',
    compressPublicAssets: { gzip: true, brotli: true },

    // '/' is prerendered so it can be the PWA's static navigateFallback: the
    // service worker serves this shell for every navigation request, and Nuxt
    // hydrates + routes client-side. Pointing the fallback at '/offline' (a
    // separate static page) instead of the app shell would make an installed
    // PWA show only the offline page for every route. '/offline' stays as the
    // explicit "you are offline" destination a page can link to.
    prerender: {
      routes: ['/', '/offline'],
    },
  },

  // sw.js must always be revalidated, never served from the HTTP cache. With
  // no Cache-Control the browser applies heuristic caching (~10% of file age)
  // and an old service worker — with a stale navigateFallback — can survive
  // for minutes to hours after a deploy, silently breaking navigation.
  routeRules: {
    '/sw.js': { headers: { 'cache-control': 'no-cache' } },
  },

  runtimeConfig: {
    // Server-only. Overridden by NUXT_* env vars in production.
    databasePath: '',
    // Which payment driver server/utils/payments/* should use. 'manual' means
    // an admin marks purchases paid by hand — the app is fully usable before a
    // gateway is connected (brief §28).
    paymentProvider: 'manual',

    public: {
      appName: 'ریکی ایز لاو',
      brand: 'Reiki_islove',
    },
  },

  app: {
    // lang/dir on <html> is what makes RTL apply to the document rather than
    // being patched per component.
    head: {
      htmlAttrs: { lang: 'fa', dir: 'rtl' },
      titleTemplate: '%s · ریکی ایز لاو',
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      meta: [
        { name: 'theme-color', content: '#faf6ef' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        {
          name: 'description',
          content: 'ریکی، مراقبه، مانترا و تقویم معنوی — فضایی آرام برای تمرین روزانه',
        },
      ],
      link: [
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        // Preload the regular weight only. Preloading all three would compete
        // with the first paint for bandwidth.
        {
          rel: 'preload',
          href: '/fonts/Vazirmatn-400.woff2',
          as: 'font',
          type: 'font/woff2',
          crossorigin: '',
        },
      ],
    },
    pageTransition: { name: 'page', mode: 'out-in' },
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'ریکی ایز لاو',
      short_name: 'ریکی ایز لاو',
      description: 'ریکی، مراقبه، مانترا و تقویم معنوی',
      lang: 'fa',
      dir: 'rtl',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#faf6ef',
      theme_color: '#1f4d3d',
      icons: [
        { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        // Without a maskable icon the Android launcher letterboxes it in a
        // white square.
        { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },

    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//, /^\/admin/, /^\/sw\.js$/, /^\/workbox-/],
      runtimeCaching: [
        {
          // Reachability probe. NetworkOnly is what makes a resolved request
          // actually mean "the server answered" — a NetworkFirst cache hit
          // also resolves with 200 and is indistinguishable. Registered first
          // because workbox matches routes in order.
          urlPattern: ({ url }) => url.pathname === '/api/ping',
          handler: 'NetworkOnly',
        },
        {
          // Protected media is access-checked per request, so caching it in the
          // service worker would hand a file to a user whose entitlement has
          // since been revoked.
          urlPattern: ({ url }) => url.pathname.startsWith('/api/media/'),
          handler: 'NetworkOnly',
        },
        {
          urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
          // Never persist authenticated responses (journals, entitlements,
          // content bodies) in shared browser caches across account switches.
          handler: 'NetworkOnly',
        },
      ],
    },

    client: { installPrompt: true },
    devOptions: { enabled: false, suppressWarnings: true, type: 'module' },
  },

  typescript: {
    // Type errors should not block a dev server; `nuxt typecheck` is the gate.
    strict: true,
    typeCheck: false,
  },

  experimental: {
    // Smaller payloads for the many list pages this app has.
    payloadExtraction: true,
  },
})
