import { defineStore } from 'pinia'

import { CLEANSE_SEED } from '@/data/cleanse-seed'
import type { CleanseRule, RulePackage } from '@/data/cleanse-types'

// 清洗加工三签封包的独立存储：与通用条目存储分开，避免封包被通用动作改写。
const STORAGE_KEY = 'data-layer-studio:cleanse-v2'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function loadRules(): CleanseRule[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return clone(CLEANSE_SEED)
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(CLEANSE_SEED))
    return clone(CLEANSE_SEED)
  }
  try {
    return JSON.parse(raw) as CleanseRule[]
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(CLEANSE_SEED))
    return clone(CLEANSE_SEED)
  }
}

export const useCleanseStore = defineStore('cleanse', {
  state: () => ({
    rules: loadRules(),
  }),
  getters: {
    ruleByCode: (state) => {
      return (code: string): CleanseRule | undefined => state.rules.find((rule) => rule.code === code)
    },
    /** 版本登记簿：清洗版本号 → 封包。QUAL/TRAN 只能按版本号从这里取包。 */
    versionIndex: (state): Map<string, RulePackage> => {
      const index = new Map<string, RulePackage>()
      for (const rule of state.rules) {
        for (const pkg of rule.packages) {
          index.set(pkg.versionNo, pkg)
        }
      }
      return index
    },
    registeredVersions: (state): string[] => {
      const versions: string[] = []
      for (const rule of state.rules) {
        for (const pkg of rule.packages) {
          versions.push(pkg.versionNo)
        }
      }
      return versions.sort()
    },
  },
  actions: {
    persist() {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.rules))
      }
    },
    resetAll() {
      this.rules = clone(CLEANSE_SEED)
      this.persist()
    },
  },
})
