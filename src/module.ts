import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineNuxtModule, addPlugin, addComponentsDir, addServerHandler } from '@nuxt/kit'
import type { MetaData } from 'metadata-scraper/lib/types'
import defu from 'defu'
import { createPageGenerateHook, createGenerateDoneHook, CrawlerPage, CrawlerHooks } from './hooks'
import type { DocSearchOptions } from './types'

enum InstantSearchThemes {
  'reset',
  'algolia',
  'satellite',
}

interface Indexer {
  storyblok: {
    accessToken: string,
    algoliaAdminApiKey: string,
    indexName: string,
    secret: string;
  }
}

interface ModuleBaseOptions {
  applicationId: string;
  apiKey: string;
  globalIndex: string;
  lite?: boolean;
  instantSearch?: boolean | { theme: keyof typeof InstantSearchThemes };
  recommend?: boolean;
  docSearch?: Partial<DocSearchOptions>;
  indexer?: Indexer;
}

declare module '@nuxt/schema' {
  interface PublicRuntimeConfig {
    algolia: ModuleBaseOptions
  }
}

export interface ModuleOptions extends ModuleBaseOptions {
  crawler?: {
    apiKey: string;
    indexName: string;
    meta:
            | ((html: string, route: string) => MetaData|Promise<MetaData>)
            | (keyof MetaData)[]
    include: ((route: string) => boolean) | (string | RegExp)[]
  }
};

export interface ModuleHooks extends CrawlerHooks {}

export * from './types'

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@nuxtjs/algolia',
    configKey: 'algolia',
    compatibility: {
      nuxt: '^3.0.0 || ^2.16.0',
      bridge: true
    }
  },
  defaults: {
    applicationId: '',
    apiKey: '',
    globalIndex: '',
    lite: true,
    instantSearch: false,
    docSearch: {},
    crawler: {
      apiKey: '',
      indexName: '',
      include: () => true,
      meta: ['title', 'description']
    }
  },
  setup (options, nuxt) {
    const runtimeDir = fileURLToPath(new URL('./runtime', import.meta.url))
    nuxt.options.build.transpile.push(runtimeDir)

    if (!options.apiKey) {
      throw new Error('`[@nuxtjs/algolia]` Missing `apiKey`')
    }

    if (!options.applicationId) {
      throw new Error('`[@nuxtjs/algolia]` Missing `applicationId`')
    }

    if (options.crawler.apiKey || options.crawler.indexName) {
      if (!options.crawler.apiKey) {
        throw new Error('`[@nuxtjs/algolia]` Missing `crawler.apiKey`')
      }

      if (!options.crawler.indexName) {
        throw new Error('`[@nuxtjs/algolia]` Missing `crawler.indexName`')
      }

      const pages: CrawlerPage[] = []

      nuxt.addHooks({
        'generate:page': createPageGenerateHook(nuxt, options, pages),
        'generate:done': createGenerateDoneHook(nuxt, options, pages)
      })
    }

    if (Object.keys(options.docSearch).length) {
      const docSearchConfig = options.docSearch

      // Defaults apiKey and applicationId to global Algolia keys if not specified by the user
      if (!docSearchConfig.apiKey && options.apiKey) { docSearchConfig.apiKey = options.apiKey }
      if (!docSearchConfig.applicationId && options.applicationId) { docSearchConfig.applicationId = options.applicationId }

      addComponentsDir({
        path: resolve(runtimeDir, 'components'),
        pathPrefix: false,
        prefix: '',
        level: 999,
        global: true
      })
    }

    if (nuxt?.options?.runtimeConfig?.public?.algolia) {
      // Nuxt 3
      nuxt.options.runtimeConfig.public.algolia = defu(nuxt.options.runtimeConfig.algolia, {
        apiKey: options.apiKey,
        applicationId: options.applicationId,
        lite: options.lite,
        instantSearch: options.instantSearch,
        docSearch: options.docSearch,
        recommend: options.recommend,
        globalIndex: options.globalIndex
      });
    } else {
      // Nuxt 2 (Edge)
      nuxt.options.publicRuntimeConfig.algolia = defu(nuxt.options.publicRuntimeConfig.algolia, {
        apiKey: options.apiKey,
        applicationId: options.applicationId,
        lite: options.lite,
        instantSearch: options.instantSearch,
        docSearch: options.docSearch,
        recommend: options.recommend,
        globalIndex: options.globalIndex
      });
    }

    if (options.instantSearch) {
      nuxt.options.build.transpile.push('vue-instantsearch/vue3')

      if (typeof options.instantSearch === 'object') {
        const { theme } = options.instantSearch
        if (theme) {
          if (theme in InstantSearchThemes) {
            nuxt.options.css.push(`instantsearch.css/themes/${theme}.css`)
          } else {
            console.error('`[@nuxtjs/algolia]` Invalid theme:', theme)
          }
        }
      }
    }

    addPlugin(resolve(runtimeDir, 'plugin'))

    nuxt.hook('autoImports:dirs', (dirs) => {
      dirs.push(resolve(runtimeDir, 'composables'))
    })

    if (options?.indexer && Object.keys(options?.indexer).length) {
      const cmsProvider = Object.keys(options.indexer)[0]

      nuxt.options.runtimeConfig.algoliaIndexer = defu(nuxt.options.runtimeConfig.algoliaIndexer, {
        [cmsProvider]: options.indexer[cmsProvider]
      })

      addServerHandler({
        route: '/api/indexer',
        handler: resolve(runtimeDir, `server/api/${cmsProvider}`),
      })
    }
  }
})
