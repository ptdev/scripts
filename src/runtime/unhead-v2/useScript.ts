// @ts-expect-error untyped
import type { UseScriptInput, UseScriptOptions, VueScriptInstance } from '@unhead/vue/scripts'
import { defu } from 'defu'
// @ts-expect-error untyped
import { useScript as _useScript } from '@unhead/vue/scripts'
import { reactive } from 'vue'
import type { NuxtDevToolsScriptInstance, NuxtUseScriptOptions, UseScriptContext } from '../types'
import { onNuxtReady, useNuxtApp, useRuntimeConfig, injectHead } from '#imports'

type UseFunctionType<T, U> = T extends {
  use: infer V
} ? V extends (...args: any) => any ? ReturnType<V> : U : U

function useNuxtScriptRuntimeConfig() {
  return useRuntimeConfig().public['nuxt-scripts'] as {
    defaultScriptOptions: NuxtUseScriptOptions
  }
}

export function resolveScriptKey(input: any): string {
  return input.key || input.src || (typeof input.innerHTML === 'string' ? input.innerHTML : '')
}

export function useScript<T extends Record<symbol | string, any> = Record<symbol | string, any>, U = Record<symbol | string, any>>(input: UseScriptInput, options?: NuxtUseScriptOptions<T, U>): UseScriptContext<UseFunctionType<NuxtUseScriptOptions<T, U>, T>> {
  input = typeof input === 'string' ? { src: input } : input
  options = defu(options, useNuxtScriptRuntimeConfig()?.defaultScriptOptions) as NuxtUseScriptOptions<T, U>
  // browser hint optimizations
  const id = String(resolveScriptKey(input) as keyof typeof nuxtApp._scripts)
  const nuxtApp = useNuxtApp()
  const head = options.head || injectHead()
  nuxtApp.$scripts = nuxtApp.$scripts! || reactive({})
  const exists = !!(nuxtApp.$scripts as Record<string, any>)?.[id]

  if (options.trigger === 'onNuxtReady' || options.trigger === 'client') {
    if (!options.warmupStrategy) {
      options.warmupStrategy = 'preload'
    }
    if (options.trigger === 'onNuxtReady') {
      options.trigger = onNuxtReady
    }
  }

  const instance = _useScript<T>(input, options as any as UseScriptOptions<T>) as UseScriptContext<UseFunctionType<NuxtUseScriptOptions<T, U>, T>>
  const _remove = instance.remove
  instance.remove = () => {
    // @ts-expect-error untyped
    nuxtApp.$scripts[id] = undefined
    return _remove()
  }
  // @ts-expect-error untyped
  nuxtApp.$scripts[id] = instance
  // used for devtools integration
  if (import.meta.dev && import.meta.client) {
    if (exists) {
      return instance as any as UseScriptContext<UseFunctionType<NuxtUseScriptOptions<T, U>, T>>
    }
    // sync scripts to nuxtApp with debug details
    const payload: NuxtDevToolsScriptInstance = {
      ...options.devtools,
      src: input.src,
      $script: null as any as VueScriptInstance<T>,
      events: [],
    }
    nuxtApp._scripts = nuxtApp._scripts! || {}

    function syncScripts() {
      // @ts-expect-error untyped
      nuxtApp._scripts[instance.id] = payload
      // @ts-expect-error untyped
      nuxtApp.hooks.callHook('scripts:updated', { scripts: nuxtApp._scripts as any as Record<string, NuxtDevToolsScriptInstance> })
    }

    // @ts-expect-error untyped
    if (!nuxtApp._scripts[instance.id]) {
      head.hooks.hook('script:updated', (ctx) => {
        if (ctx.script.id !== instance.id)
          return
        // convert the status to a timestamp
        payload.events.push({
          type: 'status',
          status: ctx.script.status,
          at: Date.now(),
        })
        payload.$script = instance
        syncScripts()
      })
      head.hooks.hook('script:instance-fn', (ctx) => {
        if (ctx.script.id !== instance.id || String(ctx.fn).startsWith('__v_'))
          return
        // log all events
        payload.events.push({
          type: 'fn-call',
          fn: ctx.fn,
          at: Date.now(),
        })
        syncScripts()
      })
      payload.$script = instance
      payload.events.push({
        type: 'status',
        status: 'awaitingLoad',
        trigger: options?.trigger,
        at: Date.now(),
      })
      syncScripts()
    }
  }
  return instance as any as UseScriptContext<UseFunctionType<NuxtUseScriptOptions<T, U>, T>>
}
