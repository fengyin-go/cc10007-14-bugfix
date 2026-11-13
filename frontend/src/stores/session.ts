import { defineStore } from 'pinia'

import { ROLE_LABELS } from '@/data/cleanse-types'
import type { RoleKey } from '@/data/cleanse-types'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '数据分层建模工作台',
    // 当前角色：盖章、启用、执行、冻结、取包都按角色受控，越权拒绝
    role: 'cleanse_owner' as RoleKey,
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
    roleLabel: (state) => ROLE_LABELS[state.role],
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setRole(role: RoleKey) {
      this.role = role
    },
  },
})
