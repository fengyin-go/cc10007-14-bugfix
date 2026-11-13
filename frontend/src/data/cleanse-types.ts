/**
 * 清洗加工三签封包的领域类型。
 * 主对象是清洗规则（CLEA），三枚签（空值策略/格式策略/生效日）齐全后才生成清洗版本号；
 * 质量校验（QUAL）与转换编排（TRAN）只能按版本号取包，取到的是只读共享对象。
 */

export type RoleKey = 'admin' | 'cleanse_owner' | 'quality_steward' | 'transform_steward' | 'scheduler'

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: '值班管理员',
  cleanse_owner: '清洗负责人',
  quality_steward: '质量负责人',
  transform_steward: '转换负责人',
  scheduler: '调度负责人',
}

export const ROLE_KEYS: RoleKey[] = ['admin', 'cleanse_owner', 'quality_steward', 'transform_steward', 'scheduler']

/** 取包消费方：QUAL 与 TRAN 只能按版本号取包。 */
export type ConsumerKey = 'quality' | 'transform'

export type SealKind = 'null_policy' | 'format_policy' | 'effective_date'

export type SealDef = {
  kind: SealKind
  /** 签的全名，如「空值策略签」 */
  label: string
  /** 列表徽标用的短名 */
  short: string
  /** 该签的归属角色，只有这个角色能盖这枚签 */
  ownerRole: RoleKey
  /** 盖章内容示例 */
  placeholder: string
}

export const SEAL_DEFS: SealDef[] = [
  {
    kind: 'null_policy',
    label: '空值策略签',
    short: '空值',
    ownerRole: 'cleanse_owner',
    placeholder: '如：空值填 0，空行剔除',
  },
  {
    kind: 'format_policy',
    label: '格式策略签',
    short: '格式',
    ownerRole: 'quality_steward',
    placeholder: '如：金额两位小数；异常阈值 0.5%',
  },
  {
    kind: 'effective_date',
    label: '生效日签',
    short: '生效日',
    ownerRole: 'scheduler',
    placeholder: '如：2026-12-01',
  },
]

export const SEAL_DEF_BY_KIND: Record<SealKind, SealDef> = {
  null_policy: SEAL_DEFS[0],
  format_policy: SEAL_DEFS[1],
  effective_date: SEAL_DEFS[2],
}

/** 一枚签：归属角色盖下，带批次序号，封包后不可改动。 */
export type Seal = {
  kind: SealKind
  batchSeq: number
  payload: string
  issuer: string
  role: RoleKey
  stampedAt: string
}

/** 封包：同一批次三签齐全时生成，清洗版本号自此固定，共享只读。 */
export type RulePackage = {
  versionNo: string
  ruleCode: string
  batchSeq: number
  seals: Record<SealKind, Seal>
  sealedAt: string
}

/** 冻结章：按签种在押，只阻止新作业，不改写旧结果及其版本号。 */
export type FreezeMark = {
  kind: SealKind
  by: string
  at: string
}

export type CleanseJob = {
  jobId: string
  versionNo: string
  at: string
  result: '成功'
}

export type RuleStatus = '草稿' | '待校验' | '已启用' | '已停用'

export const RULE_STATUSES: RuleStatus[] = ['草稿', '待校验', '已启用', '已停用']

export type CleanseRule = {
  id: number
  code: string
  sourceTable: string
  targetTable: string
  /** 归属角色：状态流转与执行只有归属角色能做，越权拒绝 */
  ownerRole: RoleKey
  status: RuleStatus
  /** 已封包的最高批次序号 */
  acceptedSeq: number
  /** 启用时绑定的清洗版本号 */
  boundVersion: string | null
  /** 在途批次：批次序号 → 已到的签（JSON 键为字符串） */
  pending: Record<string, Partial<Record<SealKind, Seal>>>
  /** 已封包的版本历史，封包后只读 */
  packages: RulePackage[]
  /** 冻结章：按签种在押 */
  freezes: Partial<Record<SealKind, FreezeMark>>
  /** 执行记录：旧结果连同版本号一起保留，冻结不改写 */
  jobs: CleanseJob[]
}

export function currentPackageOf(rule: CleanseRule): RulePackage | null {
  if (rule.packages.length === 0) {
    return null
  }
  return rule.packages.reduce((best, item) => (item.batchSeq > best.batchSeq ? item : best))
}

export function maxPendingSeq(rule: CleanseRule): number {
  const seqs = Object.keys(rule.pending).map(Number)
  return seqs.length > 0 ? Math.max(...seqs) : 0
}

export function frozenKindsOf(rule: CleanseRule): SealKind[] {
  return SEAL_DEFS.filter((def) => Boolean(rule.freezes[def.kind])).map((def) => def.kind)
}
