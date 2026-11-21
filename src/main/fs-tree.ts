// 目录树扫描(spec:T9 落点 src/main/fs-tree.ts)。接缝:shouldIgnore / scanTree(契约「测试规格」)
// 懒展开模型(controller 裁决 1):每次调用只扫 depth 层(默认 1)——根层子项直接返回,
// 子目录节点的 children 恒为 undefined,前端点开目录时对该目录再调一次 scanTree 取子层;
// node_modules/dist 等深树整扫会卡,单层扫描天然懒加载,且每次调用独立返回新树、无累积。
import { readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { basename, join } from 'node:path'
import type { TreeNode } from '../shared/ipc-contract'

// 固定忽略清单(controller 裁决 2;spec「等」的落地,具名导出供测试引用)
// .gitignore 遵守按契约明文后置,此处只做名称精确匹配
export const IGNORED_NAMES: readonly string[] = [
  '.git',
  'node_modules',
  'dist',
  'out',
  '.reference'
]

export function shouldIgnore(name: string): boolean {
  return IGNORED_NAMES.includes(name)
}

// 目录在前、同类型按名称 localeCompare(controller 裁决 9:不做文件图标/排序偏好,保持简朴)
function compareTreeNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) {
    return a.kind === 'dir' ? -1 : 1
  }
  return a.name.localeCompare(b.name)
}

export async function scanTree(root: string, depth = 1): Promise<TreeNode> {
  const node: TreeNode = { name: basename(root), path: root, kind: 'dir' }
  if (depth < 1) {
    return node
  }
  let entries: Dirent[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    // root 不存在/不可读(controller 裁决 6):扫描失败不是致命错误,返回空树,前端显示空
    return { name: basename(root), path: root, kind: 'dir', children: [] }
  }
  const children: TreeNode[] = []
  for (const entry of entries) {
    // 符号链接一律跳过(controller 裁决 3)——Why: symlink 指向任意位置,读入树有越界/环风险,
    // 既不递归也不当文件读取入口
    if (entry.isSymbolicLink()) {
      continue
    }
    if (shouldIgnore(entry.name)) {
      continue
    }
    const childPath = join(root, entry.name)
    if (entry.isDirectory()) {
      // depth - 1 = 0 时子目录 children 恒为 undefined(未扫描标记,前端据此显示展开箭头)
      children.push(await scanTree(childPath, depth - 1))
    } else if (entry.isFile()) {
      children.push({ name: entry.name, path: childPath, kind: 'file' })
    }
  }
  children.sort(compareTreeNodes)
  node.children = children
  return node
}
