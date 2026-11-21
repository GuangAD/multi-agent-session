// 接缝 parseStatusPorcelain / parseDiffLines 模块行为测试(契约「测试规格」十二条)
// 期望值来源:git 官方 porcelain v1 文档(外部参照,`git status --porcelain=v1 --branch` 的
// XY 两列语义:左侧 = 暂存区相对 HEAD,右侧 = 工作区相对暂存区)+ 手算字面量。
// 纯字符串喂入,不碰真实 git、不碰文件系统。
import { describe, expect, it } from 'vitest'
import { parseDiffLines, parseStatusPorcelain } from './git-service'

describe('parseStatusPorcelain(状态码矩阵)', () => {
  it('1. ` M a.ts` → unstaged=m,staged 为空(git porcelain 文档)', () => {
    const status = parseStatusPorcelain(' M a.ts')
    expect(status.entries).toEqual([{ path: 'a.ts', staged: ' ', unstaged: 'M' }])
  })

  it('2. `?? b.ts` → 未跟踪条目(git porcelain 文档)', () => {
    const status = parseStatusPorcelain('?? b.ts')
    // 未跟踪归「未暂存」:staged 留空、unstaged 记 '?',否则侧栏会把它错列进已暂存组
    // (契约只要求「未跟踪条目」,字段编码按 UI 分组语义定;本条口径记入 plan 开发记录)
    expect(status.entries).toEqual([{ path: 'b.ts', staged: ' ', unstaged: '?' }])
  })

  it('3. ` D c.ts` → 标记删除(git porcelain 文档)', () => {
    const status = parseStatusPorcelain(' D c.ts')
    expect(status.entries).toEqual([{ path: 'c.ts', staged: ' ', unstaged: 'D' }])
  })

  it('4. `R  old.ts -> new.ts` → 新旧路径拆分,取新路径(git porcelain 文档)', () => {
    const status = parseStatusPorcelain('R  old.ts -> new.ts')
    // 手算:R 在 X 列(已暂存重命名),Y 列为空格;条目路径取箭头右侧
    expect(status.entries).toEqual([{ path: 'new.ts', staged: 'R', unstaged: ' ' }])
  })

  it('5. `MM d.ts` → staged 与 unstaged 并存(手算)', () => {
    const status = parseStatusPorcelain('MM d.ts')
    expect(status.entries).toEqual([{ path: 'd.ts', staged: 'M', unstaged: 'M' }])
  })

  it('6. 空字符串 → 空数组,branch 仍解析(手算)', () => {
    const status = parseStatusPorcelain('')
    expect(status).toEqual({ branch: '', entries: [] })
  })

  it('7. `## main...origin/main [ahead 1]` → current=main(手算)', () => {
    const status = parseStatusPorcelain('## main...origin/main [ahead 1]')
    expect(status.branch).toBe('main')
    expect(status.entries).toEqual([])
  })

  it('7b. 空仓库 `## No commits yet on main` → current=main(缺陷守卫,T10 评审 Important-1)', () => {
    // 修复前:`...` 切分对这句不生效,branch 原样变成 "No commits yet on main" 并灌进分支下拉
    const status = parseStatusPorcelain('## No commits yet on main\nA  new.ts')
    expect(status.branch).toBe('main')
    expect(status.entries).toEqual([{ path: 'new.ts', staged: 'A', unstaged: ' ' }])
  })
})

describe('parseDiffLines(diff 行分类)', () => {
  it('8. `+foo` → added(手算)', () => {
    expect(parseDiffLines('+foo')).toEqual([{ type: 'added', text: '+foo' }])
  })

  it('9. `-bar` → removed(手算)', () => {
    expect(parseDiffLines('-bar')).toEqual([{ type: 'removed', text: '-bar' }])
  })

  it('10. ` 上下文行` → context(手算)', () => {
    expect(parseDiffLines(' 上下文行')).toEqual([{ type: 'context', text: ' 上下文行' }])
  })

  it('11. `@@ -1,2 +3,4 @@` → other(手算)', () => {
    expect(parseDiffLines('@@ -1,2 +3,4 @@')).toEqual([{ type: 'other', text: '@@ -1,2 +3,4 @@' }])
  })

  it('12. 空字符串 → 空数组(约定)', () => {
    expect(parseDiffLines('')).toEqual([])
  })
})
