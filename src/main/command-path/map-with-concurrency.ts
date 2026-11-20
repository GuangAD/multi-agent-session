// Ported from stablyai/orca src/shared/concurrency/map-with-concurrency.ts (MIT)
// Why: agents:list 安装检测按并发上限逐个探测命令,避免一次性拉起全部探测。
// 原文件的 mapWithConcurrency / mapSettledWithConcurrency 无本仓消费者,未移植;需要时随消费方一起补。

export function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  const workerCount = concurrencyWorkerCount(limit, items.length)
  if (items.length <= workerCount) {
    return Promise.all(items.map(fn)).then(() => undefined)
  }

  let nextIndex = 0
  return Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        await fn(items[index], index)
      }
    })
  ).then(() => undefined)
}

function concurrencyWorkerCount(limit: number, itemCount: number): number {
  const normalizedLimit =
    limit === Number.POSITIVE_INFINITY ? itemCount : Number.isFinite(limit) ? Math.floor(limit) : 1
  return Math.max(1, Math.min(normalizedLimit, itemCount))
}
