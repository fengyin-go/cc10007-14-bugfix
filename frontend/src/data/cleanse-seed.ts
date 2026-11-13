import type { CleanseRule } from './cleanse-types'

/**
 * 演示数据：首次打开播种，之后浏览器里的改动优先。
 * - CLEA-0001：草稿，批次 3 已盖两签，缺生效日签 —— 演示「三签不齐不生成版本号」「未过初检不能启用」。
 * - CLEA-0002：待校验，没有任何签 —— 演示「三签未齐不能启用」。
 * - CLEA-0003：已启用，V1/V2 两个封包，生效日签被冻结 —— 演示「冻结章阻止新作业且执行入口指出是哪一枚签」，
 *   旧作业结果连同版本号保留；批次 3 有一枚在途签，可继续演示两批交叉到达。
 */
export const CLEANSE_SEED: CleanseRule[] = [
  {
    id: 1,
    code: 'CLEA-0001',
    sourceTable: 'ods_trade_raw',
    targetTable: 'dwd_trade_clean',
    ownerRole: 'cleanse_owner',
    status: '草稿',
    acceptedSeq: 0,
    boundVersion: null,
    pending: {
      '3': {
        null_policy: {
          kind: 'null_policy',
          batchSeq: 3,
          payload: '空值填 0，空行剔除',
          issuer: '值班管理员',
          role: 'cleanse_owner',
          stampedAt: '2026-11-10 09:30:00',
        },
        format_policy: {
          kind: 'format_policy',
          batchSeq: 3,
          payload: '金额两位小数；异常阈值 0.5%',
          issuer: '值班管理员',
          role: 'quality_steward',
          stampedAt: '2026-11-10 10:05:00',
        },
      },
    },
    packages: [],
    freezes: {},
    jobs: [],
  },
  {
    id: 2,
    code: 'CLEA-0002',
    sourceTable: 'ods_member_raw',
    targetTable: 'dwd_member_clean',
    ownerRole: 'cleanse_owner',
    status: '待校验',
    acceptedSeq: 0,
    boundVersion: null,
    pending: {},
    packages: [],
    freezes: {},
    jobs: [],
  },
  {
    id: 3,
    code: 'CLEA-0003',
    sourceTable: 'ods_order_raw',
    targetTable: 'dwd_order_clean',
    ownerRole: 'cleanse_owner',
    status: '已启用',
    acceptedSeq: 2,
    boundVersion: 'CLEA-0003-V2',
    pending: {
      '3': {
        null_policy: {
          kind: 'null_policy',
          batchSeq: 3,
          payload: '空值填 0，空行保留并打标',
          issuer: '值班管理员',
          role: 'cleanse_owner',
          stampedAt: '2026-11-11 14:20:00',
        },
      },
    },
    packages: [
      {
        versionNo: 'CLEA-0003-V1',
        ruleCode: 'CLEA-0003',
        batchSeq: 1,
        seals: {
          null_policy: {
            kind: 'null_policy',
            batchSeq: 1,
            payload: '空值剔除',
            issuer: '值班管理员',
            role: 'cleanse_owner',
            stampedAt: '2026-09-01 09:00:00',
          },
          format_policy: {
            kind: 'format_policy',
            batchSeq: 1,
            payload: '金额取整；异常阈值 1.0%',
            issuer: '值班管理员',
            role: 'quality_steward',
            stampedAt: '2026-09-01 09:10:00',
          },
          effective_date: {
            kind: 'effective_date',
            batchSeq: 1,
            payload: '2026-09-01',
            issuer: '值班管理员',
            role: 'scheduler',
            stampedAt: '2026-09-01 09:20:00',
          },
        },
        sealedAt: '2026-09-01 09:20:00',
      },
      {
        versionNo: 'CLEA-0003-V2',
        ruleCode: 'CLEA-0003',
        batchSeq: 2,
        seals: {
          null_policy: {
            kind: 'null_policy',
            batchSeq: 2,
            payload: '空值填 0',
            issuer: '值班管理员',
            role: 'cleanse_owner',
            stampedAt: '2026-10-09 11:00:00',
          },
          format_policy: {
            kind: 'format_policy',
            batchSeq: 2,
            payload: '金额两位小数；异常阈值 0.5%',
            issuer: '值班管理员',
            role: 'quality_steward',
            stampedAt: '2026-10-09 11:10:00',
          },
          effective_date: {
            kind: 'effective_date',
            batchSeq: 2,
            payload: '2026-10-10',
            issuer: '值班管理员',
            role: 'scheduler',
            stampedAt: '2026-10-09 11:20:00',
          },
        },
        sealedAt: '2026-10-09 11:20:00',
      },
    ],
    freezes: {
      effective_date: {
        kind: 'effective_date',
        by: '值班管理员',
        at: '2026-11-12 08:40:00',
      },
    },
    jobs: [
      {
        jobId: 'JOB-CLEA-0003-001',
        versionNo: 'CLEA-0003-V1',
        at: '2026-09-02 02:00:00',
        result: '成功',
      },
      {
        jobId: 'JOB-CLEA-0003-002',
        versionNo: 'CLEA-0003-V2',
        at: '2026-10-10 02:00:00',
        result: '成功',
      },
    ],
  },
]
