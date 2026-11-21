// 接缝 shouldIgnore / scanTree 模块行为测试(契约「测试规格」五条)
// 期望值来源:brief 第 5 节固定忽略清单(含 .reference)与手算目录结构;mkdtemp 构造临时目录,
// 不依赖真实项目;afterEach 清理。
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { IGNORED_NAMES, scanTree, shouldIgnore } from './fs-tree'
import type { TreeNode } from '../shared/ipc-contract'

// 本轮用例创建的临时根目录,afterEach 统一递归删除
const tempRoots: string[] = []

async function makeTempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fs-tree-'))
  tempRoots.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

// 全树收集节点名(测试 4 的兜底断言用,与被测代码无共享算法,只是遍历)
function collectNames(node: TreeNode): string[] {
  return [node.name, ...(node.children?.flatMap(collectNames) ?? [])]
}

describe('shouldIgnore / scanTree(固定忽略清单)', () => {
  it('清单第 1 项 .git:树中不出现(brief 约束)', async () => {
    const root = await makeTempRoot()
    await mkdir(join(root, '.git'))
    await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/main')
    await writeFile(join(root, 'README.md'), 'demo')

    const tree = await scanTree(root)

    // 手算:根层只剩唯一普通文件 README.md,.git 连同其内容整体消失
    expect(tree.kind).toBe('dir')
    expect(tree.children?.map((child) => child.name)).toEqual(['README.md'])
  })

  it('清单第 2 项 node_modules:树中不出现;shouldIgnore 纯函数逐项核对(手算)', async () => {
    const root = await makeTempRoot()
    await mkdir(join(root, 'node_modules'))
    await writeFile(join(root, 'node_modules', 'leftpad.js'), 'x')
    await writeFile(join(root, 'index.js'), 'x')

    const tree = await scanTree(root)
    expect(tree.children?.map((child) => child.name)).toEqual(['index.js'])

    // 纯函数断言并入本条(裁决 8):固定清单五项(controller 裁决 2 原文),普通名不误伤
    expect([...IGNORED_NAMES]).toEqual(['.git', 'node_modules', 'dist', 'out', '.reference'])
    for (const name of IGNORED_NAMES) {
      expect(shouldIgnore(name)).toBe(true)
    }
    expect(shouldIgnore('src')).toBe(false)
    expect(shouldIgnore('node_modules.bak')).toBe(false) // 精确匹配,不做前缀/包含
  })

  it('清单第 3 项 .reference:树中不出现(brief 第 5 节)', async () => {
    const root = await makeTempRoot()
    await mkdir(join(root, '.reference'))
    await writeFile(join(root, '.reference', 'orca.ts'), 'x')
    await mkdir(join(root, 'docs'))

    const tree = await scanTree(root)
    // 手算:.reference 被挡,根层只剩 docs
    expect(tree.children?.map((child) => child.name)).toEqual(['docs'])
    expect(collectNames(tree)).not.toContain('.reference')
  })

  it('清单第 4 条 任意深度生效:a/b/node_modules 深层不进树(手算)', async () => {
    const root = await makeTempRoot()
    await mkdir(join(root, 'a', 'b', 'node_modules'), { recursive: true })
    await writeFile(join(root, 'a', 'b', 'node_modules', 'pkg.js'), 'x')
    await writeFile(join(root, 'a', 'b', 'keep.txt'), 'x')

    // depth=3:root → a → b 的子层全部扫到,node_modules 在第三层仍被挡
    const tree = await scanTree(root, 3)
    const a = tree.children?.[0]
    const b = a?.children?.[0]
    expect(a?.name).toBe('a')
    expect(b?.name).toBe('b')
    expect(b?.children?.map((child) => child.name)).toEqual(['keep.txt'])

    // 兜底:全树任意位置不出现 node_modules
    expect(collectNames(tree)).not.toContain('node_modules')
  })

  it('普通目录 src 保留且 children 正确;默认 depth=1 只扫一层(手算)', async () => {
    const root = await makeTempRoot()
    await mkdir(join(root, 'src', 'sub'), { recursive: true })
    await writeFile(join(root, 'src', 'util.ts'), 'x')
    await writeFile(join(root, 'src', 'main.ts'), 'x')
    await writeFile(join(root, 'src', 'sub', 'inner.ts'), 'x')

    // 默认 depth=1(裁决 1):只扫根层,src 的子层未扫描(children undefined)
    const shallow = await scanTree(root)
    expect(shallow.children?.map((child) => child.name)).toEqual(['src'])
    expect(shallow.children?.[0]?.children).toBeUndefined()

    // depth=2:src 的 children 展开;目录在前、文件按名称 localeCompare(main.ts < util.ts)
    const deep = await scanTree(root, 2)
    const src = deep.children?.[0]
    expect(src?.children?.map((child) => `${child.kind}:${child.name}`)).toEqual([
      'dir:sub',
      'file:main.ts',
      'file:util.ts'
    ])
  })
})
