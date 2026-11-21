// 选中文件只读预览:文本内容 + 截断/二进制/错误提示 + 「VS Code 打开」按钮
// (spec:components/file-panel/FilePreview;读取经 bridge.files.read,错误经载荷 error 字段
// 返回,主进程不抛,controller 裁决 4/6)
import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { bridge } from '../../ipc/bridge'
import { Button } from '../ui/button'
import type { FilePreviewResult } from '../../../../shared/ipc-contract'

// 渲染层请求字节数:预览区小窗,200KB 足够读;主进程另有 [1, 2_000_000] clamp(裁决 4)
const PREVIEW_MAX_BYTES = 200_000
// 截断时读到的字节数 = PREVIEW_MAX_BYTES(恰好),换算 KB 提示(200000/1024 ≈ 195)
const TRUNCATED_KB = Math.round(PREVIEW_MAX_BYTES / 1024)

export function FilePreview({ path }: { path: string }): React.JSX.Element {
  const [result, setResult] = useState<FilePreviewResult | null>(null)

  // 组件由父级以 key={path} 挂载(切换文件即重挂,读取态自然归零),本 effect 只拉一次数据;
  // setState 仅出现在异步回调(react-hooks/set-state-in-effect)
  useEffect(() => {
    let cancelled = false
    bridge.files
      .read({ path, maxBytes: PREVIEW_MAX_BYTES })
      .then((r) => {
        if (!cancelled) {
          setResult(r)
        }
      })
      .catch((error) => {
        // invoke 层异常兜底(常规错误走载荷 error 字段);卸载后的迟到响应用 cancelled 挡住
        if (!cancelled) {
          setResult({ content: '', truncated: false, binary: false, error: String(error) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [path])

  const name = path.split(/[\\/]/).pop() ?? path

  return (
    <div className="flex min-h-0 flex-1 flex-col p-1">
      <div className="flex shrink-0 items-center gap-1 px-1 pb-1">
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={path}>
          {name}
        </span>
        <Button
          variant="ghost"
          aria-label={`通过 VS Code 打开 ${name}`}
          onClick={() => void bridge.files.openInEditor(path)}
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </Button>
      </div>
      {result === null ? null : result.error !== undefined ? (
        <p className="px-1 text-xs text-red-500 dark:text-red-400">{result.error}</p>
      ) : result.binary ? (
        <div className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
          <p>二进制文件,不支持预览</p>
          <p className="mt-1 text-zinc-400 dark:text-zinc-500">用右上角按钮在 VS Code 中打开</p>
        </div>
      ) : (
        <>
          {result.truncated && (
            <p className="px-1 pb-1 text-xs text-amber-600 dark:text-amber-400">
              内容过长,已截断显示前 {TRUNCATED_KB} KB
            </p>
          )}
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
            {result.content}
          </pre>
        </>
      )}
    </div>
  )
}
