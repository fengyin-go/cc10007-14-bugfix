import { listRows, resetRows, saveRows } from '@/data/local-store'
import {
  ROLE_LABELS,
  SEAL_DEFS,
  SEAL_DEF_BY_KIND,
  currentPackageOf,
  frozenKindsOf,
  maxPendingSeq,
} from '@/data/cleanse-types'
import type {
  CleanseRule,
  ConsumerKey,
  FreezeMark,
  RoleKey,
  RulePackage,
  Seal,
  SealKind,
} from '@/data/cleanse-types'
import type { EntryRow } from '@/data/types'
import { useCleanseStore } from '@/stores/cleanse'
import { useSessionStore } from '@/stores/session'

export type ServiceResult = { ok: boolean; message: string }
export type FetchResult = ServiceResult & { pkg: RulePackage | null }
export type ReviewResult = ServiceResult & { report: string[] }

function ok(message: string): ServiceResult {
  return { ok: true, message }
}

function fail(message: string): ServiceResult {
  return { ok: false, message }
}

function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

/** 越权拒绝：动作归属角色与当前角色不一致时统一走这里。 */
function deny(action: string, needRole: RoleKey): ServiceResult {
  const session = useSessionStore()
  return fail(
    `越权拒绝：${action}归属「${ROLE_LABELS[needRole]}」，当前角色「${ROLE_LABELS[session.role]}」无权操作`,
  )
}

function findRule(code: string): CleanseRule | null {
  const store = useCleanseStore()
  return store.rules.find((rule) => rule.code === code) ?? null
}

function touch(): void {
  useCleanseStore().persist()
}

/**
 * 把清洗规则的状态镜像回通用条目存储：运营概览与 CSV 导出仍走通用层，
 * 但清洗页本身只读封包存储，保证列表与详情同源。
 */
function mirrorToRegistry(rule: CleanseRule): void {
  const rows = listRows('cleanse')
  const current = currentPackageOf(rule)
  const mirrored: EntryRow = {
    id: rule.id,
    status: rule.status,
    pending: rule.status !== '已停用',
    abnormal: frozenKindsOf(rule).length > 0,
    规则编号: rule.code,
    输入表名: rule.sourceTable,
    目标表名: rule.targetTable,
    空值处理: current ? current.seals.null_policy.payload : '未封包',
    格式校验: current ? current.seals.format_policy.payload : '未封包',
    异常阈值: current ? '见格式策略签' : '—',
    规则版本: current ? current.versionNo : '未封包',
    生效日期: current ? current.seals.effective_date.payload : '—',
  }
  const index = rows.findIndex((row) => String(row['规则编号']) === rule.code)
  const next = [...rows]
  if (index >= 0) {
    next[index] = { ...next[index], ...mirrored, id: next[index].id }
  } else {
    next.push(mirrored)
  }
  saveRows('cleanse', next)
}

/** 登记清洗规则：只有清洗负责人能登记，新规则归属清洗负责人。 */
export function createRule(sourceTable: string, targetTable: string): ServiceResult {
  const session = useSessionStore()
  if (session.role !== 'cleanse_owner') {
    return deny('登记清洗规则', 'cleanse_owner')
  }
  if (!sourceTable.trim() || !targetTable.trim()) {
    return fail('输入表名与目标表名不能为空')
  }
  const store = useCleanseStore()
  const id = store.rules.reduce((max, rule) => Math.max(max, rule.id), 0) + 1
  const code = `CLEA-${String(id).padStart(4, '0')}`
  const rule: CleanseRule = {
    id,
    code,
    sourceTable: sourceTable.trim(),
    targetTable: targetTable.trim(),
    ownerRole: 'cleanse_owner',
    status: '草稿',
    acceptedSeq: 0,
    boundVersion: null,
    pending: {},
    packages: [],
    freezes: {},
    jobs: [],
  }
  store.rules.push(rule)
  touch()
  mirrorToRegistry(rule)
  return ok(`清洗规则 ${code} 已登记（草稿），归属「清洗负责人」；三签封包并过初检后方可启用`)
}

/** 提交校验（初检）：草稿/已停用 → 待校验。 */
export function submitCheck(code: string): ServiceResult {
  const session = useSessionStore()
  const rule = findRule(code)
  if (!rule) {
    return fail(`没有找到清洗规则 ${code}`)
  }
  if (session.role !== rule.ownerRole) {
    return deny('提交校验', rule.ownerRole)
  }
  if (rule.status !== '草稿' && rule.status !== '已停用') {
    return fail(`当前状态「${rule.status}」无需提交校验`)
  }
  rule.status = '待校验'
  touch()
  mirrorToRegistry(rule)
  return ok(`清洗规则 ${code} 已提交校验（初检），当前状态「待校验」`)
}

/**
 * 启用规则：必须先过初检（待校验），且三签封包已生成清洗版本号。
 * 已启用但绑定落后于最新封包时，再次启用即升级绑定，列表与详情同步刷新。
 */
export function enableRule(code: string): ServiceResult {
  const session = useSessionStore()
  const rule = findRule(code)
  if (!rule) {
    return fail(`没有找到清洗规则 ${code}`)
  }
  if (session.role !== rule.ownerRole) {
    return deny('启用规则', rule.ownerRole)
  }
  const current = currentPackageOf(rule)
  if (rule.status === '已启用') {
    if (current && rule.boundVersion !== current.versionNo) {
      rule.boundVersion = current.versionNo
      touch()
      mirrorToRegistry(rule)
      return ok(`已升级绑定到最新封包 ${current.versionNo}，列表与详情同步生效`)
    }
    return fail(`清洗规则 ${code} 已启用，且绑定的就是最新封包，不用重复操作`)
  }
  if (rule.status !== '待校验') {
    return fail(`未过初检不能启用：当前状态「${rule.status}」，请先提交校验`)
  }
  if (!current) {
    return fail('三签未齐：空值策略签、格式策略签、生效日签齐全封包后才生成清洗版本号，未封包不能启用')
  }
  rule.status = '已启用'
  rule.boundVersion = current.versionNo
  touch()
  mirrorToRegistry(rule)
  return ok(`清洗规则 ${code} 已启用，绑定清洗版本号 ${current.versionNo}`)
}

/** 停用规则：已启用 → 已停用；绑定版本号保留，供回看核对。 */
export function disableRule(code: string): ServiceResult {
  const session = useSessionStore()
  const rule = findRule(code)
  if (!rule) {
    return fail(`没有找到清洗规则 ${code}`)
  }
  if (session.role !== rule.ownerRole) {
    return deny('停用规则', rule.ownerRole)
  }
  if (rule.status !== '已启用') {
    return fail(`当前状态「${rule.status}」不能停用`)
  }
  rule.status = '已停用'
  touch()
  mirrorToRegistry(rule)
  return ok(`清洗规则 ${code} 已停用，历史封包与执行结果的版本号保持不变`)
}

/**
 * 盖章：空值策略签/格式策略签/生效日签各归一个角色，越权拒绝。
 * 两批三签交叉到达时，只接受完整且序号更高的包：
 * - 不高于已封包序号的批次拒收（已封包是共享对象，只读不能改动）；
 * - 已有更高序号批次在途时，低序号批次的签拒收；
 * - 同一批次同一签种不能重复盖，变更需用更高批次序号。
 */
export function stampSeal(code: string, kind: SealKind, batchSeq: number, payload: string): ServiceResult {
  const session = useSessionStore()
  const rule = findRule(code)
  if (!rule) {
    return fail(`没有找到清洗规则 ${code}`)
  }
  const def = SEAL_DEF_BY_KIND[kind]
  if (session.role !== def.ownerRole) {
    return deny(`盖${def.label}`, def.ownerRole)
  }
  const text = payload.trim()
  if (!text) {
    return fail(`${def.label}内容不能为空`)
  }
  if (kind === 'effective_date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return fail('生效日签内容需为日期，格式如 2026-12-01')
  }
  if (!Number.isInteger(batchSeq) || batchSeq < 1) {
    return fail('批次序号需为正整数')
  }
  if (batchSeq <= rule.acceptedSeq) {
    return fail(
      `批次 ${batchSeq} 不高于已封包批次 ${rule.acceptedSeq}：已封包为共享对象，只读不能改动，本签拒收`,
    )
  }
  const maxPending = maxPendingSeq(rule)
  if (batchSeq < maxPending) {
    return fail(
      `已有更高序号批次 ${maxPending} 在途，低序号批次 ${batchSeq} 的${def.label}拒收：两批交叉到达时只接受完整且序号更高的包`,
    )
  }
  const key = String(batchSeq)
  const batch = rule.pending[key] ?? {}
  if (batch[kind]) {
    return fail(`批次 ${batchSeq} 的${def.label}已盖章，封包前不能改动；如需变更请以更高批次序号重盖`)
  }
  const seal: Seal = {
    kind,
    batchSeq,
    payload: text,
    issuer: session.operator,
    role: session.role,
    stampedAt: now(),
  }
  rule.pending[key] = { ...batch, [kind]: seal }
  const merged = rule.pending[key]
  const arrived = SEAL_DEFS.filter((item) => Boolean(merged[item.kind]))
  if (arrived.length === SEAL_DEFS.length) {
    const versionNo = `${rule.code}-V${batchSeq}`
    const pkg: RulePackage = {
      versionNo,
      ruleCode: rule.code,
      batchSeq,
      seals: {
        null_policy: merged.null_policy as Seal,
        format_policy: merged.format_policy as Seal,
        effective_date: merged.effective_date as Seal,
      },
      sealedAt: now(),
    }
    rule.packages.push(pkg)
    rule.acceptedSeq = batchSeq
    for (const pendingKey of Object.keys(rule.pending)) {
      if (Number(pendingKey) <= batchSeq) {
        delete rule.pending[pendingKey]
      }
    }
    touch()
    mirrorToRegistry(rule)
    return ok(
      `三签齐全（空值策略签/格式策略签/生效日签），已生成清洗版本号 ${versionNo}；旧封包与旧执行结果的版本号保持不变`,
    )
  }
  touch()
  return ok(`${def.label}已盖入批次 ${batchSeq}（${arrived.length}/3），三枚齐全后才会生成清洗版本号`)
}

/** 冻结章：值班管理员按签种冻结，只阻止新作业，不改写旧结果及其版本号。 */
export function freezeSeal(code: string, kind: SealKind): ServiceResult {
  const session = useSessionStore()
  const rule = findRule(code)
  if (!rule) {
    return fail(`没有找到清洗规则 ${code}`)
  }
  if (session.role !== 'admin') {
    return deny(`冻结${SEAL_DEF_BY_KIND[kind].label}`, 'admin')
  }
  if (rule.freezes[kind]) {
    return fail(`${SEAL_DEF_BY_KIND[kind].label}已处于冻结状态`)
  }
  const mark: FreezeMark = { kind, by: session.operator, at: now() }
  rule.freezes[kind] = mark
  touch()
  mirrorToRegistry(rule)
  return ok(`已冻结「${SEAL_DEF_BY_KIND[kind].label}」：新作业将被阻止；旧执行结果及其清洗版本号不改写`)
}

export function unfreezeSeal(code: string, kind: SealKind): ServiceResult {
  const session = useSessionStore()
  const rule = findRule(code)
  if (!rule) {
    return fail(`没有找到清洗规则 ${code}`)
  }
  if (session.role !== 'admin') {
    return deny(`解冻${SEAL_DEF_BY_KIND[kind].label}`, 'admin')
  }
  if (!rule.freezes[kind]) {
    return fail(`${SEAL_DEF_BY_KIND[kind].label}未被冻结`)
  }
  delete rule.freezes[kind]
  touch()
  mirrorToRegistry(rule)
  return ok(`已解冻「${SEAL_DEF_BY_KIND[kind].label}」，新作业可正常发起`)
}

/**
 * 执行入口：发起新清洗作业。
 * 有冻结章在押时阻止新作业，并明确点出被冻结的是哪一枚签；
 * 旧执行结果连同版本号一起保留，不被改写。
 */
export function executeJob(code: string): ServiceResult {
  const session = useSessionStore()
  const rule = findRule(code)
  if (!rule) {
    return fail(`没有找到清洗规则 ${code}`)
  }
  if (session.role !== rule.ownerRole) {
    return deny('执行清洗作业', rule.ownerRole)
  }
  if (rule.status !== '已启用' || !rule.boundVersion) {
    return fail(`清洗规则 ${code} 未启用，不能发起清洗作业`)
  }
  const frozen = frozenKindsOf(rule)
  if (frozen.length > 0) {
    const detail = frozen
      .map((kind) => {
        const mark = rule.freezes[kind]
        const label = SEAL_DEF_BY_KIND[kind].label
        return mark ? `${label}（${mark.by} 冻结于 ${mark.at}）` : label
      })
      .join('、')
    return fail(
      `新作业被阻止：${detail}正被冻结章冻结；旧执行结果及其清洗版本号 ${rule.boundVersion} 保持不变，解冻后可重新发起`,
    )
  }
  const job = {
    jobId: `JOB-${rule.code}-${String(rule.jobs.length + 1).padStart(3, '0')}`,
    versionNo: rule.boundVersion,
    at: now(),
    result: '成功' as const,
  }
  rule.jobs.push(job)
  touch()
  return ok(`作业 ${job.jobId} 已按清洗版本号 ${job.versionNo} 执行完成`)
}

/**
 * QUAL/TRAN 取包：只能按清洗版本号取，取到的是共享只读对象。
 * 没有「读最新」的入口，避免 QUAL 再串到上一阈值、TRAN 查不到本次规则包。
 */
export function fetchPackageByVersion(versionNo: string, consumer: ConsumerKey): FetchResult {
  const session = useSessionStore()
  const allowed: RoleKey[] = ['quality_steward', 'transform_steward']
  if (!allowed.includes(session.role)) {
    return {
      ok: false,
      message: `越权拒绝：清洗规则包仅「质量负责人」「转换负责人」可按版本号取用，当前角色「${ROLE_LABELS[session.role]}」`,
      pkg: null,
    }
  }
  const store = useCleanseStore()
  const pkg = store.versionIndex.get(versionNo.trim())
  if (!pkg) {
    return {
      ok: false,
      message: `查不到本次规则包：清洗版本号 ${versionNo.trim() || '(空)'} 未登记，请与清洗负责人核对`,
      pkg: null,
    }
  }
  const consumerLabel = consumer === 'quality' ? '质量校验' : '转换编排'
  return {
    ok: true,
    message: `${consumerLabel}已按清洗版本号取包 ${pkg.versionNo}（共享对象，只读不能改动）`,
    pkg: JSON.parse(JSON.stringify(pkg)) as RulePackage,
  }
}

/** 回看核对：以清洗规则为主对象，核对清洗版本号链路是否一致。 */
export function reviewRule(code: string): ReviewResult {
  const rule = findRule(code)
  if (!rule) {
    return { ok: false, message: `没有找到清洗规则 ${code}`, report: [] }
  }
  const current = currentPackageOf(rule)
  const report: string[] = []
  report.push(
    `主对象：清洗规则 ${rule.code}（${rule.sourceTable} → ${rule.targetTable}），当前状态「${rule.status}」，归属「${ROLE_LABELS[rule.ownerRole]}」`,
  )
  report.push(
    `最新封包：${current ? `${current.versionNo}（批次 ${current.batchSeq}）` : '尚未封包'}；启用绑定：${rule.boundVersion ?? '未绑定'}`,
  )
  if (rule.boundVersion && current) {
    report.push(
      rule.boundVersion === current.versionNo
        ? `核对通过：启用绑定与最新封包一致（${current.versionNo}）`
        : `核对提醒：启用绑定 ${rule.boundVersion} 落后于最新封包 ${current.versionNo}，列表已标记「有新封包待启用」`,
    )
  }
  const ordered = [...rule.packages].sort((a, b) => a.batchSeq - b.batchSeq)
  for (const pkg of ordered) {
    const isCurrent = current ? pkg.versionNo === current.versionNo : false
    report.push(
      `封包 ${pkg.versionNo}：批次 ${pkg.batchSeq}，${pkg.sealedAt} 封包，三签齐全（空值策略签/格式策略签/生效日签）${isCurrent ? '，当前生效' : '，历史版本'}`,
    )
  }
  for (const job of rule.jobs) {
    const registered = rule.packages.some((pkg) => pkg.versionNo === job.versionNo)
    report.push(
      `作业 ${job.jobId}：使用清洗版本号 ${job.versionNo}，结果${job.result}，该版本${registered ? '已登记，核对一致' : '未登记，核对异常'}`,
    )
  }
  const frozen = frozenKindsOf(rule)
  report.push(
    frozen.length > 0
      ? `冻结在押：${frozen.map((kind) => SEAL_DEF_BY_KIND[kind].label).join('、')}（新作业被阻止，旧结果与版本号不改写）`
      : '冻结在押：无',
  )
  return { ok: true, message: `清洗规则 ${code} 回看核对完成`, report }
}

/** 重置演示数据：封包存储回到播种值，通用条目存储同步镜像。 */
export function resetCleanseDemo(): ServiceResult {
  const store = useCleanseStore()
  store.resetAll()
  resetRows('cleanse')
  for (const rule of store.rules) {
    mirrorToRegistry(rule)
  }
  return ok('清洗加工演示数据已重置')
}
