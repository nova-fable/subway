import { statSync } from 'node:fs'
import { join } from 'node:path'

export default defineNuxtConfig({
  devServer: {
    port: 4321,
  },

  runtimeConfig: {
    public: {
      MAP_URL: process.env.MAP_URL,
      DATA_UPDATED_AT: statSync(join(__dirname, './datasource/data.json')).mtime,
    },
  },

  components: [
    { path: '~/components', pathPrefix: false },
  ],

  modules: [
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@nuxthq/ui',
    '@oku-ui/motion-nuxt',
  ],
  experimental: {
    // when using generate, payload js assets included in sw precache manifest
    // but missing on offline, disabling extraction it until fixed
    payloadExtraction: false,
    renderJsonPayloads: true,
  },

  colorMode: {
    classSuffix: '',
  },

  nitro: {
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    routeRules: {
      '/**': {
        headers: {
          'X-Frame-Options': 'DENY',
          'Content-Security-Policy': 'frame-ancestors \'none\'',
        },
      },
    },
    // prerender: {
    //   crawlLinks: false,
    //   routes: ['/'],
    //   ignore: ['/hi'],
    // },
  },

  app: {
    head: {
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/svg+xml', href: '/nuxt.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      ],
    },
  },

  devtools: {
    enabled: true,
  },
})
