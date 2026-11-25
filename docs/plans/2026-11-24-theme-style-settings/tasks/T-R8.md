# T-R8 收尾

> 依赖:T-R1~T-R7 全部完成 | 对应:dev 阶段 5 第 1 步 + brief 第 7.1 节验收逐项;spec 覆盖标准全表

## 实现方式

**干什么**:原子片落地后的完整验证与冒烟清单移交。不新增功能代码。

**处理**

1. `pnpm typecheck`:node + web 两投影 0 error。
2. `pnpm test`:全量绿,记录文件数与用例数。
3. `pnpm build`:exit 0。
4. **产物校验**(第一版 T1 的教训:纯样式改动只跑 typecheck 与单测发现不了 CSS 未进产物):
   - `out/renderer/assets/*.css` 里 `.theme-` 类 **12 个**逐一在产物中;
   - `.dark.theme-` 残留 **0 处**;
   - `--app-base` 出现次数 ≥ 13(`:root` + `.dark` + 12 块中至少 13 处);
   - `xterm-container`、`data-scrollbars` 仍在产物(防 main.css 的 @import 再被吞)。
5. 冒烟清单写入根目录 `TODO.md`(用户实机验证):12 套界面主题逐个切换、22 套终端主题分组下拉、界面无右侧空白带、PTY 画面不乱、旧 store.json 迁移、重启保持、系统深浅变化不影响观感、标题栏无主题按钮且齿轮可用。
6. plan.md 记账:八任务勾选 + 同一 commit 哈希 + 各任务结论;`DECISIONS.md` 若有判断需要修订(J-004 表述),按 domain-docs 规则在收尾时登记。

**失败与退出**:任一项红即如实报,不用替代测试假装通过。

## 接口(伪代码)

无。

## 开发步骤

1. `pnpm typecheck`;Expected: exit 0。
2. `pnpm test`;Expected: exit 0,记录 `N passed`(不得为 0)。
3. `pnpm build`;Expected: exit 0。
4. 产物校验脚本(grep 计数);Expected: 12 个 `.theme-<id>` 全在、`.dark.theme-` 0 处、`--app-base` ≥ 13、`xterm-container` 与 `data-scrollbars` 均在。
5. 冒烟项追加 `TODO.md`。
6. 对照 brief 第 7.1 节十条验收逐项标「通过 / 未验证 / 本机不可达」。

## 测试规格

无新接缝。本任务是验证动作本身,不是新测试模块;条数与产物检查结果写入 plan.md 的开发记录。
