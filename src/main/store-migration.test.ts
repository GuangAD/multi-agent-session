// 接缝 migrateLegacyStore 模块行为测试(T11 评审 Minor-9:用户数据搬迁的关键决策点必须可测)
// 期望值来源:产品名改名的既定语义(复制而非搬移、新有旧不覆盖、旧无不动手)+ 手算。
// 用临时目录构造三种状态,不碰真实 %APPDATA%。
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateLegacyStore } from './store-migration'

const tempRoots: string[] = []

async function makePair(): Promise<{ newDir: string; legacyDir: string }> {
  const root = await mkdtemp(join(tmpdir(), 'store-migration-'))
  tempRoots.push(root)
  return { newDir: join(root, 'Soloport'), legacyDir: join(root, 'agent-sessions') }
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('migrateLegacyStore(改名搬迁)', () => {
  it('1. 新目录无、旧目录有 → 复制到新目录,旧文件保留(复制而非搬移)', async () => {
    const { newDir, legacyDir } = await makePair()
    await mkdir(legacyDir, { recursive: true })
    await writeFile(join(legacyDir, 'store.json'), '{"version":1}')

    const result = await migrateLegacyStore(newDir, legacyDir)

    expect(result).toEqual({ migrated: true })
    expect(await readFile(join(newDir, 'store.json'), 'utf8')).toBe('{"version":1}')
    expect(existsSync(join(legacyDir, 'store.json'))).toBe(true) // 旧文件不动
  })

  it('2. 新目录已有 store.json → 不覆盖(用户已在新名字下工作过)', async () => {
    const { newDir, legacyDir } = await makePair()
    await mkdir(newDir, { recursive: true })
    await mkdir(legacyDir, { recursive: true })
    await writeFile(join(newDir, 'store.json'), '{"from":"new"}')
    await writeFile(join(legacyDir, 'store.json'), '{"from":"legacy"}')

    const result = await migrateLegacyStore(newDir, legacyDir)

    expect(result).toEqual({ migrated: false, reason: 'new-exists' })
    expect(await readFile(join(newDir, 'store.json'), 'utf8')).toBe('{"from":"new"}')
  })

  it('3. 旧目录没有 store.json → 什么都不做(全新安装),不抛错', async () => {
    const { newDir, legacyDir } = await makePair()
    await mkdir(legacyDir, { recursive: true })

    const result = await migrateLegacyStore(newDir, legacyDir)

    expect(result).toEqual({ migrated: false, reason: 'legacy-missing' })
    expect(existsSync(join(newDir, 'store.json'))).toBe(false)
  })
})
