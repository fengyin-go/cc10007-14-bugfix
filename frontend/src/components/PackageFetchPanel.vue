<template>
  <section class="fetch-panel" :data-consumer="consumer">
    <h3>清洗规则包取用（{{ consumerLabel }}）</h3>
    <p class="panel-desc">
      只能按清洗版本号取包，没有「读最新」入口；取到的规则包是共享对象，只读不能改动。
      当前角色：{{ session.roleLabel }}（仅质量负责人、转换负责人可取包）。
    </p>
    <form class="fetch-bar" @submit.prevent="fetchPkg">
      <input
        v-model="versionInput"
        :list="`registered-versions-${consumer}`"
        placeholder="输入清洗版本号，如 CLEA-0003-V2"
      />
      <datalist :id="`registered-versions-${consumer}`">
        <option v-for="version in versions" :key="version" :value="version" />
      </datalist>
      <button class="btn primary" type="submit">按版本号取包</button>
    </form>
    <p v-if="message" class="fetch-message" :class="ok ? 'notice-text' : 'error-text'">{{ message }}</p>
    <div v-if="pkg" class="package-view">
      <p class="package-head">
        <strong>{{ pkg.versionNo }}</strong>
        <span class="badge readonly">共享对象 · 只读</span>
      </p>
      <dl>
        <dt>所属规则</dt>
        <dd>{{ pkg.ruleCode }}</dd>
        <dt>封包批次</dt>
        <dd>批次 {{ pkg.batchSeq }}（{{ pkg.sealedAt }} 封包）</dd>
      </dl>
      <ul class="seal-list">
        <li v-for="def in sealDefs" :key="def.kind">
          <span class="seal-name">{{ def.label }}</span>
          <span class="seal-payload">{{ pkg.seals[def.kind].payload }}</span>
          <span class="seal-meta">{{ pkg.seals[def.kind].issuer }} 盖于 {{ pkg.seals[def.kind].stampedAt }}</span>
        </li>
      </ul>
      <p v-if="consumer === 'quality'" class="threshold-note">
        本次阈值来源：{{ pkg.versionNo }} 格式策略签 —— 按版本号锁定，不再沿用上一阈值。
      </p>
      <p v-else class="threshold-note">
        本次转换依据：{{ pkg.versionNo }} 三签封包 —— 按版本号锁定，本次规则包可查证。
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { fetchPackageByVersion } from '@/api/cleanse-service'
import { SEAL_DEFS } from '@/data/cleanse-types'
import type { ConsumerKey, RulePackage } from '@/data/cleanse-types'
import { useCleanseStore } from '@/stores/cleanse'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ consumer: ConsumerKey }>()

const session = useSessionStore()
const cleanseStore = useCleanseStore()
const sealDefs = SEAL_DEFS

const consumerLabel = computed(() => (props.consumer === 'quality' ? '质量校验 QUAL' : '转换编排 TRAN'))
const versions = computed(() => cleanseStore.registeredVersions)

const versionInput = ref('')
const message = ref('')
const ok = ref(false)
const pkg = ref<RulePackage | null>(null)

function fetchPkg() {
  const result = fetchPackageByVersion(versionInput.value, props.consumer)
  ok.value = result.ok
  message.value = result.message
  pkg.value = result.pkg
}
</script>
