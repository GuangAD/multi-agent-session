// 回填协调(接缝 BackfillCoordinator):「待回填资格」的并发许可。
// 同一 agent + 项目目录同时只有一个会话持有资格:先开者持有,其关闭或回填成功时释放,
// 后开者接棒;持有者按节流轮询该 agent 存储的新会话文件,发现即把候选 id 返回给编排层写回记录;
// imported 会话永不参与;轮询到头(放弃时限)无果则放弃,记录保持无 id(brief 第 5 节)。
// 标题随行(2026-11-24):回填拿到 id 后,agent 侧标题(externalTitle)写回会话名;标题晚于
// 会话文件出现时(pi)由 pollForTitle 轻量补捞,见下「标题写回与标题补捞」节。
// Why: scan 由编排层注入——本模块不 import agents 域(领域横向依赖禁令,spec 模块划分)。
// 落点:src/main/session-store/backfill.ts(spec 接口面清单「BackfillCoordinator」)
import type { ImportCandidate } from '../../shared/agents'
import type { Session, SessionId } from '../../shared/types'

// 节流档位:750ms 起、2000、3000 逐级放慢,其后 15000 封顶循环。
// Ported from stablyai/orca src/renderer/src/components/terminal-pane/agent-completion/
// agent-completion-poll-cadence.ts (MIT) POLL_TIER_INTERVAL_MS——active 750 / idle 2000 /
// hidden 3000 / quiet-agent 15000;plan 附录 A4:「关联回填轮询照抄此节流」。
// 具名导出:测试可引用定值(断言仍以 Orca 档位字面量为准)。
export const BACKFILL_POLL_INTERVALS_MS = [750, 2000, 3000, 15000]

// 总放弃时限:从 claim 起算 5 分钟(controller 裁决 3),到时返回 null,记录保持无 id
export const BACKFILL_GIVE_UP_MS = 300_000

// —— 候选新鲜度护栏(评审 Important-1 修法 Fix-1,纯函数)——
// Why(评审 Important-1 场景):首扫在 spawn 后立即执行,新 agent 进程尚未来得及建文件;
// 项目存储里任何从未导入的老文件(T6 导入遗漏、跳过、解析失败均现实存在)不在
// 「已有 externalSessionId」集合里,会被首扫直接当候选 → 老对话 id 写进本会话记录,
// 重开续接到别的对话——恰是本接缝核心防线的失败形态。
// Why 用文件 mtime 而非 activityAt:五家 scan 全部总产 filePath——pi/claude/codex/antigravity
// 为 transcript 路径、kimi 为 state.json 路径,语义跨家一致,不依赖 activityAt 的格式统一;
// 且 mtime 判定不受「会话内容最后更新时间」语义漂移影响。
// 残余边界(如实登记):仍在被写入的活跃老会话(终端并行跑 agent)mtime 晚于 claim,仍会入选——
// 这是 brief「同 agent+项目单待回填简单规则、指纹匹配后置为增强」的固有边界,不为它加复杂度。
// 语义:只保留「文件出现于 claim 之后」的候选——mtimeOf 返回 null(stat 失败/无时间)本 tick
// 丢弃(文件可能在写入中,下个 tick 再看,不因此结束轮询);mtimeMs <= claimedAtMs 老文件丢弃;
// > claimedAtMs 保留,并按 mtimeMs 升序排序(同 agent+项目多新候选时,最早的文件属于先 spawn
// 的会话——先启动先建文件,与「单待回填资格 = 先开者」身份吻合,消费方取首个不再是盲猜)。
export function filterFreshCandidates(
  candidates: ImportCandidate[],
  claimedAtMs: number,
  mtimeOf: (filePath: string) => number | null
): ImportCandidate[] {
  const fresh: Array<{ candidate: ImportCandidate; mtimeMs: number }> = []
  for (const candidate of candidates) {
    // filePath 缺失(类型可选,五家扫描器实际全产)与 stat 失败同口径:本 tick 丢弃
    if (candidate.filePath === undefined) {
      continue
    }
    const mtimeMs = mtimeOf(candidate.filePath)
    if (mtimeMs === null || mtimeMs <= claimedAtMs) {
      continue // 无时间可判或早于/恰等于 claim(<= 语义)→ 非本会话 claim 之后的新文件,丢弃
    }
    fresh.push({ candidate, mtimeMs })
  }
  return fresh.sort((a, b) => a.mtimeMs - b.mtimeMs).map((item) => item.candidate)
}

// —— 标题写回与标题补捞(2026-11-24:回填成功后用 agent 侧标题更新会话名)——

// 标题补捞放弃时限:从启动补捞起算 2 分钟。
// Why 比回填 300_000ms 短:标题只是显示优化,不值得陪跑回填全程;超时保持 agent 名,无害。
export const BACKFILL_TITLE_GIVE_UP_MS = 120_000

// 标题写回判定(纯函数):候选带非空标题且记录仍是默认 agent 显示名才采用。
// Why 守卫:回填写回发生在 spawn 后数秒~数分钟,期间用户可能已双击改名;用户命名 > agent 侧标题。
// 边界(如实登记):用户故意把会话名改成与 agent 显示名完全相同会被覆盖——极罕见,不为它加字段。
export function pickBackfillTitle(
  sessionTitle: string,
  agentName: string,
  candidate?: { externalTitle?: string }
): string | null {
  const externalTitle = candidate?.externalTitle?.trim()
  if (!externalTitle || sessionTitle !== agentName) {
    return null
  }
  return externalTitle
}

// 在途标题补捞的中止回调:release(关标签/删会话)时一并中止——agent 已死,标题不可能再出现,
// 继续轮询只是空转;编排层另有「记录还在不在」守卫,这里负责及时止损。
const titlePolls = new Map<SessionId, () => void>()

// 标题补捞轮询:pi 等启动即建会话文件的 agent,标题(首条用户消息)晚于文件出现,而 poll 拿到
// id 就收场——标题由本函数接力:按已知 externalSessionId 精确匹配候选拿到非空标题即返回;
// Why 不复用回填 scan 闭包的 known 过滤:已写回的 id 恰会被它排除;也不做新鲜度护栏,
// id 已锁定不存在串线。节流档位沿用回填;超时/中止返回 null(标题保持 agent 名,无害)。
export function pollForTitle(
  sessionId: SessionId,
  externalSessionId: string,
  scan: () => Promise<ImportCandidate[]>
): Promise<string | null> {
  if (titlePolls.has(sessionId)) {
    return Promise.resolve(null) // 重入:同会话已在补捞,不叠加循环
  }
  let scanTimer: ReturnType<typeof setTimeout> | null = null
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null
  let tierIndex = 0
  let settled = false

  return new Promise<string | null>((resolve) => {
    const finish = (result: string | null): void => {
      if (settled) {
        return
      }
      settled = true
      if (scanTimer) {
        clearTimeout(scanTimer)
      }
      if (deadlineTimer) {
        clearTimeout(deadlineTimer)
      }
      titlePolls.delete(sessionId)
      resolve(result)
    }
    titlePolls.set(sessionId, () => finish(null))

    deadlineTimer = setTimeout(() => finish(null), BACKFILL_TITLE_GIVE_UP_MS)

    const tick = async (): Promise<void> => {
      if (settled) {
        return
      }
      let candidates: ImportCandidate[]
      try {
        candidates = await scan()
      } catch {
        candidates = [] // 扫描瞬时失败按无候选处理,继续节流(与 poll 同口径)
      }
      if (settled) {
        return // scan await 期间被 release:不再写回
      }
      const title = candidates
        .find((candidate) => candidate.externalSessionId === externalSessionId)
        ?.externalTitle?.trim()
      if (title) {
        finish(title)
        return
      }
      // 节流:档位逐级放慢,封顶档循环(与 poll 同款)
      const interval =
        BACKFILL_POLL_INTERVALS_MS[Math.min(tierIndex, BACKFILL_POLL_INTERVALS_MS.length - 1)]
      tierIndex += 1
      scanTimer = setTimeout(() => {
        void tick()
      }, interval)
    }
    void tick()
  })
}

// 内表:当前持资格(轮询中)的会话;claim 登记、release 摘除(poll 结束自动摘)
const holders = new Map<SessionId, Session>()
// claim 时刻:5 分钟放弃时限的起算点(controller 裁决 3:从 claim 起算)
const claimedAt = new Map<SessionId, number>()
// 在途轮询的中止回调(sessionId → 以 null 收场):release 时立即停轮询,
// Why: 标签页关闭/记录删除后 agent 已死,新会话文件不可能再属于它;若轮询继续,
// 会把「后开者接棒会话」的新文件误写进已关闭会话的记录(串线),必须随资格释放立即停止。
const activePolls = new Map<SessionId, () => void>()

// 纯判定(契约伪代码):origin=created 且同 agent+项目无其他持有者 → true(并登记持有);
// activePeers 由编排层注入当前轮询集(契约裁决 4);内表再核一道,防调用方漏传 peers 时双持。
function claim(session: Session, activePeers: Session[]): boolean {
  // imported 会话永不参与(brief 第 5 节:资格只发「待回填」的自建会话)
  if (session.origin !== 'created') {
    return false
  }
  const sameSpot = (other: { agentId: string; projectId: string }): boolean =>
    other.agentId === session.agentId && other.projectId === session.projectId
  const conflict =
    activePeers.some((peer) => peer.id !== session.id && sameSpot(peer)) ||
    [...holders.values()].some((held) => held.id !== session.id && sameSpot(held))
  if (conflict) {
    return false // 同 agent+项目已有持有者:后开者不回填,重开原样拉起
  }
  holders.set(session.id, session) // 先开者持有
  claimedAt.set(session.id, Date.now())
  return true
}

// 释放资格(标签页关闭/记录删除/轮询收场):立即中止在途轮询
function release(sessionId: SessionId): void {
  holders.delete(sessionId)
  claimedAt.delete(sessionId)
  const abort = activePolls.get(sessionId)
  if (abort) {
    abort() // 以 null 收场,编排层不会写回
  }
  const titleAbort = titlePolls.get(sessionId)
  if (titleAbort) {
    titleAbort() // 标题补捞随资格释放一并中止(agent 已死,标题不可能再出现)
  }
}

// 副作用与重入(契约伪代码):节流轮询 scan,发现新候选返回其 id,放弃返回 null;
// 成功与放弃都自动释放资格。重入:同会话已在轮询 → 直接以 null 收场,不叠加循环。
function poll(session: Session, scan: () => Promise<ImportCandidate[]>): Promise<string | null> {
  if (activePolls.has(session.id)) {
    return Promise.resolve(null)
  }
  // 放弃时限从 claim 起算;未经 claim 直接 poll 时以当下为起点兜底(正常链路必先 claim)
  const startedAt = claimedAt.get(session.id) ?? Date.now()
  let scanTimer: ReturnType<typeof setTimeout> | null = null
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null
  let tierIndex = 0
  let settled = false

  return new Promise<string | null>((resolve) => {
    const finish = (result: string | null): void => {
      if (settled) {
        return
      }
      settled = true
      if (scanTimer) {
        clearTimeout(scanTimer)
      }
      if (deadlineTimer) {
        clearTimeout(deadlineTimer)
      }
      // 先摘中止回调再释放:release 会查 activePolls,顺序错会自环
      activePolls.delete(session.id)
      release(session.id) // 成功(伪代码明说)与放弃都释放资格
      resolve(result)
    }
    activePolls.set(session.id, () => finish(null))

    deadlineTimer = setTimeout(
      () => finish(null),
      Math.max(0, startedAt + BACKFILL_GIVE_UP_MS - Date.now())
    )

    const tick = async (): Promise<void> => {
      if (settled) {
        return
      }
      // 资格已被释放(标签页关闭/记录删除,后开者接棒):本轮停止,不再扫描、不写回
      if (!holders.has(session.id)) {
        finish(null)
        return
      }
      let candidates: ImportCandidate[]
      try {
        candidates = await scan()
      } catch {
        candidates = [] // 扫描瞬时失败(存储目录暂不可达等)按无候选处理,继续节流
      }
      if (settled || !holders.has(session.id)) {
        // scan await 期间被释放:同上停止,绝不把别人的候选写回本会话
        finish(null)
        return
      }
      const found = candidates[0]
      if (found) {
        finish(found.externalSessionId)
        return
      }
      // 节流:档位逐级放慢,封顶档循环(750 → 2000 → 3000 → 15000 → 15000 → …)
      const interval =
        BACKFILL_POLL_INTERVALS_MS[Math.min(tierIndex, BACKFILL_POLL_INTERVALS_MS.length - 1)]
      tierIndex += 1
      scanTimer = setTimeout(() => {
        void tick()
      }, interval)
    }
    void tick()
  })
}

// 退出等场景全量清空(入口 before-quit;薄层即可,controller 裁决 4)
function releaseAll(): void {
  for (const id of new Set([...holders.keys(), ...activePolls.keys()])) {
    release(id)
  }
}

// 只读查询:当前持有资格(轮询中)的会话副本,供编排层作 claim 的 activePeers
// (controller 裁决 4;返回副本,调用方改动不进内表)
function pollingSessions(): Session[] {
  return [...holders.values()].map((session) => ({ ...session }))
}

// 契约伪代码的接缝名(spec 接口面清单「BackfillCoordinator」);成员为上面的模块级纯函数,
// Why 独立函数:poll 的收场闭包要调 release,对象字面量方法互相引用需 this,独立函数更直白
export const BackfillCoordinator = {
  claim,
  poll,
  pollForTitle,
  release,
  releaseAll,
  pollingSessions
}
