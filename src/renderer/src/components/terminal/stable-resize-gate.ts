// 窗口 resize 稳定门(T5):高频 resize 抖动合并成单次「布局已稳定」信号
// 规格:docs/plans/2026-11-25-terminal-backpressure/spec.md「数据结构」节 / brief 第 5 节
// 用途:窗口拖拽期间 resize 事件以帧率密集到达,直接触发重设会逐帧重排振荡;
// 静默期(200ms 量级)无新事件才判定布局稳定,onSettled 恰回调一次。
// 用法:resize 处理器里只调 notifyResize;onSettled 回调内不得再调 notifyResize(自触发循环)。
// timer:内部 setTimeout/clearTimeout,vitest fake timers 驱动(T3 同款裁定:不加注入参数)

export type StableResizeGateOptions = {
  // 静默期:窗口无新 resize 事件的持续时长,满即判定布局稳定(brief 第 5 节:200ms 量级)
  quietMs: number
  // 稳定回调:每轮抖动收敛后调用
  onSettled: () => void
}

export type StableResizeGate = {
  // 抖动期间反复调用:每次调用重置静默期计时
  notifyResize: () => void
  // 清计时器(测试收尾 / 接线卸载用)
  reset: () => void
}

export function createStableResizeGate(options: StableResizeGateOptions): StableResizeGate {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    notifyResize(): void {
      if (timer !== null) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => {
        timer = null
        options.onSettled()
      }, options.quietMs)
    },
    reset(): void {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }
  }
}
