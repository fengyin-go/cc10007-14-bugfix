<template>
  <section class="page" data-module="cleanse">
    <header class="page-head">
      <div>
        <h2>清洗加工管理</h2>
        <p class="page-desc">
          以清洗规则为主对象：空值策略签、格式策略签、生效日签三签齐全才生成清洗版本号；
          质量校验与转换编排只能按版本号取包，冻结章只阻止新作业、不改写旧结果及其版本号。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记清洗规则</button>
        <button class="btn" type="button" @click="exportRows">导出清洗加工清单</button>
        <button class="btn ghost" type="button" @click="resetDemo">重置演示数据</button>
      </div>
    </header>

    <p class="role-hint">
      当前角色：{{ session.roleLabel }}（右上角可切换）。盖章按签种归属角色，启用/执行归属清洗负责人，
      冻结章归属值班管理员，越权一律拒绝。
    </p>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent>
      <label class="filter-item">
        <span>规则编号</span>
        <input v-model="filters.code" placeholder="按规则编号检索" />
      </label>
      <label class="filter-item">
        <span>输入表名</span>
        <input v-model="filters.source" placeholder="按输入表名检索" />
      </label>
      <label class="filter-item">
        <span>目标表名</span>
        <input v-model="filters.target" placeholder="按目标表名检索" />
      </label>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>规则编号</th>
          <th>输入表名</th>
          <th>目标表名</th>
          <th>当前清洗版本</th>
          <th>三签进度</th>
          <th>冻结章</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="rule in filteredRules" :key="rule.code">
          <td>{{ rule.code }}</td>
          <td>{{ rule.sourceTable }}</td>
          <td>{{ rule.targetTable }}</td>
          <td>{{ currentVersion(rule) ?? '未封包' }}</td>
          <td class="seal-cell">
            <span
              v-for="def in sealDefs"
              :key="def.kind"
              class="seal-dot"
              :class="sealClass(rule, def.kind)"
              :title="sealTip(rule, def.kind)"
            >
              {{ def.short }}
            </span>
          </td>
          <td>{{ frozenLabels(rule) || '—' }}</td>
          <td>
            <span class="badge" :class="statusClass(rule)">{{ statusText(rule) }}</span>
            <span v-if="staleBinding(rule)" class="badge amber">有新封包 {{ currentVersion(rule) }} 待启用</span>
          </td>
          <td class="row-actions">
            <button class="link" type="button" @click="doSubmitCheck(rule)">提交校验</button>
            <button class="link" type="button" @click="doEnable(rule)">启用规则</button>
            <button class="link" type="button" @click="doDisable(rule)">停用规则</button>
            <button class="link" type="button" @click="doExecute(rule)">执行作业</button>
            <button class="link" type="button" @click="openDetail(rule)">详情</button>
          </td>
        </tr>
        <tr v-if="!filteredRules.length">
          <td colspan="8" class="empty-state">暂无清洗加工数据，可先登记清洗规则</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ filteredRules.length }} 条清洗加工记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-if="noticeMessage" class="notice-text">{{ noticeMessage }}</span>
    </footer>

    <section v-if="creating" class="detail-panel">
      <header class="panel-head">
        <h3>登记清洗规则</h3>
        <button class="btn ghost" type="button" @click="creating = false">取消</button>
      </header>
      <div class="field-row">
        <input v-model="createForm.source" placeholder="输入表名，如 ods_trade_raw" />
        <input v-model="createForm.target" placeholder="目标表名，如 dwd_trade_clean" />
        <button class="btn primary" type="button" @click="submitCreate">提交登记</button>
      </div>
    </section>

    <section v-if="selected" class="detail-panel">
      <header class="panel-head">
        <h3>清洗规则 {{ selected.code }} · 详情面板</h3>
        <button class="btn ghost" type="button" @click="closeDetail">关闭</button>
      </header>
      <p class="panel-desc">列表与详情同源读取封包存储：盖章、封包、冻结即时联动，列表不再把旧对象显示成有效，详情不再丢新值。</p>

      <div class="info-grid">
        <div><span>输入表名</span>{{ selected.sourceTable }}</div>
        <div><span>目标表名</span>{{ selected.targetTable }}</div>
        <div><span>归属角色</span>{{ roleLabels[selected.ownerRole] }}</div>
        <div><span>当前状态</span>{{ selected.status }}</div>
        <div><span>启用绑定</span>{{ selected.boundVersion ?? '未绑定' }}</div>
        <div><span>最新封包</span>{{ currentVersion(selected) ?? '未封包' }}</div>
        <div><span>在途批次</span>{{ maxPending(selected) || '无' }}</div>
        <div><span>冻结在押</span>{{ frozenLabels(selected) || '无' }}</div>
      </div>

      <h4>三签封包</h4>
      <p class="panel-desc">
        盖章批次序号
        <input v-model.number="stampBatch" class="batch-input" type="number" min="1" />
        —— 同一批次三签齐全才生成清洗版本号；两批交叉到达时，只接受完整且序号更高的包。
      </p>
      <div class="seal-grid">
        <article
          v-for="def in sealDefs"
          :key="def.kind"
          class="seal-card"
          :class="{ frozen: isFrozen(selected, def.kind) }"
        >
          <h4>
            {{ def.label }}
            <small>归属：{{ roleLabels[def.ownerRole] }}</small>
          </h4>
          <p class="seal-state">
            <template v-if="inflightSeal(selected, def.kind)">
              批次 {{ inflightSeal(selected, def.kind)!.batchSeq }} 已盖：{{ inflightSeal(selected, def.kind)!.payload }}
              <em>{{ inflightSeal(selected, def.kind)!.issuer }} · {{ inflightSeal(selected, def.kind)!.stampedAt }}</em>
            </template>
            <template v-else>当前批次未盖</template>
          </p>
          <p v-if="isFrozen(selected, def.kind)" class="freeze-line">
            冻结章在押：{{ selected.freezes[def.kind]!.by }} 冻结于 {{ selected.freezes[def.kind]!.at }}
          </p>
          <div class="field-row">
            <input v-model="sealDrafts[def.kind]" :placeholder="def.placeholder" />
            <button class="btn" type="button" @click="stamp(def.kind)">盖章</button>
          </div>
          <div class="field-row">
            <button v-if="!isFrozen(selected, def.kind)" class="btn ghost" type="button" @click="freeze(def.kind)">
              冻结此签
            </button>
            <button v-else class="btn ghost" type="button" @click="unfreeze(def.kind)">解冻此签</button>
          </div>
        </article>
      </div>

      <h4>当前封包 <span class="badge readonly">共享对象 · 只读</span></h4>
      <div v-if="currentPackage(selected)" class="package-view">
        <dl>
          <dt>清洗版本号</dt>
          <dd>{{ currentPackage(selected)!.versionNo }}</dd>
          <dt>封包批次</dt>
          <dd>批次 {{ currentPackage(selected)!.batchSeq }}（{{ currentPackage(selected)!.sealedAt }} 封包）</dd>
        </dl>
        <ul class="seal-list">
          <li v-for="def in sealDefs" :key="def.kind">
            <span class="seal-name">{{ def.label }}</span>
            <span class="seal-payload">{{ currentPackage(selected)!.seals[def.kind].payload }}</span>
            <span class="seal-meta">
              {{ currentPackage(selected)!.seals[def.kind].issuer }} 盖于
              {{ currentPackage(selected)!.seals[def.kind].stampedAt }}
            </span>
          </li>
        </ul>
      </div>
      <p v-else class="empty-state">尚未封包：三枚签齐全后才会生成清洗版本号。</p>

      <h4>执行入口</h4>
      <div class="field-row">
        <button class="btn primary" type="button" @click="executeSelected">执行清洗作业</button>
        <span class="panel-desc">
          冻结章在押时新作业被阻止，并指出被冻结的是哪一枚签；旧执行结果及其版本号不改写。
        </span>
      </div>

      <h4>版本历史与回看核对</h4>
      <table v-if="selected.jobs.length" class="data-table">
        <thead>
          <tr><th>作业号</th><th>清洗版本号</th><th>执行时间</th><th>结果</th></tr>
        </thead>
        <tbody>
          <tr v-for="job in selected.jobs" :key="job.jobId">
            <td>{{ job.jobId }}</td>
            <td>{{ job.versionNo }}</td>
            <td>{{ job.at }}</td>
            <td>{{ job.result }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-state">暂无执行记录</p>
      <div class="field-row">
        <button class="btn" type="button" @click="review">回看核对</button>
        <span class="panel-desc">以清洗规则为主对象，核对清洗版本号链路。</span>
      </div>
      <ul v-if="report.length" class="report-list">
        <li v-for="(line, index) in report" :key="index">{{ line }}</li>
      </ul>

      <p v-if="panelError" class="error-text">{{ panelError }}</p>
      <p v-if="panelNotice" class="notice-text">{{ panelNotice }}</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import {
  createRule,
  disableRule,
  enableRule,
  executeJob,
  freezeSeal,
  resetCleanseDemo,
  reviewRule,
  stampSeal,
  submitCheck,
  unfreezeSeal,
} from '@/api/cleanse-service'
import { downloadEntries } from '@/api/local-service'
import {
  ROLE_LABELS,
  RULE_STATUSES,
  SEAL_DEFS,
  SEAL_DEF_BY_KIND,
  currentPackageOf,
  frozenKindsOf,
  maxPendingSeq,
} from '@/data/cleanse-types'
import type { CleanseRule, RulePackage, Seal, SealKind } from '@/data/cleanse-types'
import { useCleanseStore } from '@/stores/cleanse'
import { useSessionStore } from '@/stores/session'

const store = useCleanseStore()
const session = useSessionStore()
const sealDefs = SEAL_DEFS
const roleLabels = ROLE_LABELS

const filters = reactive({ code: '', source: '', target: '' })
const errorMessage = ref('')
const noticeMessage = ref('')

const stats = computed(() => [
  { label: '清洗规则总数', value: store.rules.length },
  { label: '已启用规则', value: store.rules.filter((rule) => rule.status === '已启用').length },
  { label: '已封包版本', value: store.rules.reduce((sum, rule) => sum + rule.packages.length, 0) },
  { label: '冻结在押签', value: store.rules.reduce((sum, rule) => sum + frozenKindsOf(rule).length, 0) },
])

const statusSummary = computed(() =>
  RULE_STATUSES.map((status) => ({
    status,
    count: store.rules.filter((rule) => rule.status === status).length,
  })),
)

const filteredRules = computed(() =>
  store.rules.filter(
    (rule) =>
      rule.code.includes(filters.code.trim()) &&
      rule.sourceTable.includes(filters.source.trim()) &&
      rule.targetTable.includes(filters.target.trim()),
  ),
)

function show(result: { ok: boolean; message: string }) {
  if (result.ok) {
    noticeMessage.value = result.message
    errorMessage.value = ''
  } else {
    errorMessage.value = result.message
    noticeMessage.value = ''
  }
}

function resetFilters() {
  filters.code = ''
  filters.source = ''
  filters.target = ''
}

function exportRows() {
  downloadEntries('cleanse')
}

function resetDemo() {
  closeDetail()
  show(resetCleanseDemo())
}

function currentPackage(rule: CleanseRule): RulePackage | null {
  return currentPackageOf(rule)
}

function currentVersion(rule: CleanseRule): string | null {
  return currentPackageOf(rule)?.versionNo ?? null
}

function maxPending(rule: CleanseRule): number {
  return maxPendingSeq(rule)
}

function isFrozen(rule: CleanseRule, kind: SealKind): boolean {
  return Boolean(rule.freezes[kind])
}

function frozenLabels(rule: CleanseRule): string {
  return frozenKindsOf(rule)
    .map((kind) => SEAL_DEF_BY_KIND[kind].label)
    .join('、')
}

function inflightSeal(rule: CleanseRule, kind: SealKind): Seal | null {
  const seq = maxPendingSeq(rule)
  if (!seq) {
    return null
  }
  return rule.pending[String(seq)]?.[kind] ?? null
}

function sealClass(rule: CleanseRule, kind: SealKind): string {
  if (isFrozen(rule, kind)) {
    return 'frozen'
  }
  return inflightSeal(rule, kind) ? 'stamped' : ''
}

function sealTip(rule: CleanseRule, kind: SealKind): string {
  const def = SEAL_DEF_BY_KIND[kind]
  if (isFrozen(rule, kind)) {
    return `${def.label}：冻结章在押`
  }
  const seal = inflightSeal(rule, kind)
  return seal ? `${def.label}：批次 ${seal.batchSeq} 已盖「${seal.payload}」` : `${def.label}：待盖`
}

function staleBinding(rule: CleanseRule): boolean {
  const current = currentPackageOf(rule)
  return rule.status === '已启用' && Boolean(current) && rule.boundVersion !== current!.versionNo
}

function statusText(rule: CleanseRule): string {
  return rule.status === '已启用' && rule.boundVersion ? `已启用·${rule.boundVersion}` : rule.status
}

function statusClass(rule: CleanseRule): string {
  if (rule.status === '已启用') {
    return staleBinding(rule) ? 'amber' : 'green'
  }
  if (rule.status === '待校验') {
    return 'blue'
  }
  return 'gray'
}

function doSubmitCheck(rule: CleanseRule) {
  show(submitCheck(rule.code))
}

function doEnable(rule: CleanseRule) {
  show(enableRule(rule.code))
}

function doDisable(rule: CleanseRule) {
  show(disableRule(rule.code))
}

function doExecute(rule: CleanseRule) {
  show(executeJob(rule.code))
}

// 登记
const creating = ref(false)
const createForm = reactive({ source: '', target: '' })

function openCreate() {
  creating.value = true
}

function submitCreate() {
  const result = createRule(createForm.source, createForm.target)
  show(result)
  if (result.ok) {
    createForm.source = ''
    createForm.target = ''
    creating.value = false
  }
}

// 详情面板
const selectedCode = ref<string | null>(null)
const selected = computed(() => store.rules.find((rule) => rule.code === selectedCode.value) ?? null)
const stampBatch = ref(1)
const sealDrafts = reactive<Record<SealKind, string>>({
  null_policy: '',
  format_policy: '',
  effective_date: '',
})
const panelError = ref('')
const panelNotice = ref('')
const report = ref<string[]>([])

function showInPanel(result: { ok: boolean; message: string }) {
  if (result.ok) {
    panelNotice.value = result.message
    panelError.value = ''
  } else {
    panelError.value = result.message
    panelNotice.value = ''
  }
}

function openDetail(rule: CleanseRule) {
  selectedCode.value = rule.code
  stampBatch.value = Math.max(rule.acceptedSeq + 1, maxPendingSeq(rule))
  sealDrafts.null_policy = ''
  sealDrafts.format_policy = ''
  sealDrafts.effective_date = ''
  panelError.value = ''
  panelNotice.value = ''
  report.value = []
}

function closeDetail() {
  selectedCode.value = null
  report.value = []
}

function stamp(kind: SealKind) {
  const rule = selected.value
  if (!rule) {
    return
  }
  const result = stampSeal(rule.code, kind, stampBatch.value, sealDrafts[kind])
  showInPanel(result)
  if (result.ok) {
    sealDrafts[kind] = ''
    stampBatch.value = Math.max(rule.acceptedSeq + 1, maxPendingSeq(rule))
  }
}

function freeze(kind: SealKind) {
  const rule = selected.value
  if (rule) {
    showInPanel(freezeSeal(rule.code, kind))
  }
}

function unfreeze(kind: SealKind) {
  const rule = selected.value
  if (rule) {
    showInPanel(unfreezeSeal(rule.code, kind))
  }
}

function executeSelected() {
  const rule = selected.value
  if (rule) {
    showInPanel(executeJob(rule.code))
  }
}

function review() {
  const rule = selected.value
  if (!rule) {
    return
  }
  const result = reviewRule(rule.code)
  report.value = result.report
  showInPanel(result)
}
</script>
