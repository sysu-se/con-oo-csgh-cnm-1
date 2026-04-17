# con-oo-csgh-cnm-1 - Review

## Review 结论

当前提交在 `src/domain/index.js` 中做出了一套有一定封装意识的 `Sudoku` / `Game` 领域对象，但它基本没有进入真实 Svelte 游戏流程；前端仍然围绕旧 store 和二维数组运转，Undo/Redo 也未接线。同时，domain 采用的“只允许合法落子”规则与当前界面的“允许试填并高亮冲突”业务模型并不一致。因此，这份代码不能算完成了本次作业最核心的“领域对象真实接入 Svelte”目标。

## 总体评价

| 维度 | 评价 |
| --- | --- |
| OOP | fair |
| JS Convention | fair |
| Sudoku Business | poor |
| OOD | fair |

## 缺点

### 1. 领域对象没有进入真实游戏主流程

- 严重程度：core
- 位置：src/App.svelte:3-6; src/components/Modal/Types/Welcome.svelte:2-4,16-23; src/node_modules/@sudoku/game.js:13-34; src/node_modules/@sudoku/stores/grid.js:7-137
- 原因：开始新局、加载题目、棋盘渲染、用户输入、胜利判定都仍由旧的 `@sudoku/game` 与 `grid/userGrid` store 驱动；`src/domain/index.js` 在仓库内没有任何业务 import。按作业要求，`Game/Sudoku` 应成为 UI 的真实核心，这里仍是“领域对象存在，但界面没用它”。

### 2. Undo/Redo 根本未接入任何逻辑

- 严重程度：core
- 位置：src/components/Controls/ActionBar/Actions.svelte:26-35
- 原因：两个按钮只有视觉元素，没有 `on:click`，也没有调用 `Game.undo()` / `Game.redo()` 或任何旧撤销栈逻辑。作业明确要求界面中的撤销/重做必须调用领域对象逻辑，这里是功能和接入都缺失。

### 3. 领域模型与当前数独交互业务不一致

- 严重程度：core
- 位置：src/domain/index.js:420-437; src/components/Controls/Keyboard.svelte:18-24; src/node_modules/@sudoku/stores/grid.js:93-137; src/components/Board/index.svelte:48-51
- 原因：当前 UI 允许玩家先填入任意数字，再通过 `invalidCells` 高亮冲突；而 `Sudoku.guess()` 遇到冲突会直接抛错并拒绝写入。也就是说，domain 建模的是“只接受合法落子”的求解器语义，而界面实现的是“允许试填并显示冲突”的玩家交互语义，二者无法直接对接。

### 4. Game API 不是面向 Svelte 消费的边界

- 严重程度：major
- 位置：src/domain/index.js:18-27,619-667,774-779
- 原因：公开接口只有 `getGrid()`/`guess()` 这类命令式方法，状态读取依赖反复 getter/clone，既没有 `subscribe`，也没有 adapter store。作业推荐的“store adapter”缺位，导致 UI 只能继续围绕旧 store 派生 `invalidCells`、`gameWon`、选中格等状态，而不是消费 `Game` 的响应式视图状态。

### 5. 查询接口与命令接口的合法性语义不一致

- 严重程度：major
- 位置：src/domain/index.js:395-399,430-432,648-650
- 原因：`guess()` 会拒绝修改 givens，但 `isMoveValid()`/`Game.isMoveValid()` 只检查数独规则，不把 givens 视为非法。这会误导 UI 适配层：一个 move 可能先被“验证通过”，真正提交时却抛错，说明领域 API 契约不稳定。

### 6. Svelte 接入仍在直接 mutate 二维数组

- 严重程度：major
- 位置：src/node_modules/@sudoku/stores/grid.js:73-86
- 原因：`userGrid.update()` 内部直接改 `$userGrid[pos.y][pos.x]` 后返回同一个数组引用，依赖的是 Svelte writable 对对象值的通知细节。这个写法虽然可能刷新，但可读性和可迁移性都差，也进一步说明当前 UI 绑定的是裸数组而不是领域对象。

### 7. 组件里使用手动订阅而不是 `$store`/显式清理

- 严重程度：minor
- 位置：src/App.svelte:12-17
- 原因：根组件直接 `gameWon.subscribe(...)`，没有保存 unsubscribe，也没有在组件销毁时清理。作为根组件影响有限，但从 Svelte 惯例看，更合理的方式是 `$gameWon` 配合 reactive statement，或在生命周期中显式清理订阅。

## 优点

### 1. 构造阶段有完整的输入规范化与盘面校验

- 位置：src/domain/index.js:171-326
- 原因：`Sudoku` 在创建时统一处理 9x9 结构、数值范围、givens 合法性和初始规则一致性，能把非法状态尽早挡在领域边界外。

### 2. Move 值对象让历史记录语义明确

- 位置：src/domain/index.js:108-157,657-728
- 原因：`Move` 把 `row/col/oldValue/newValue` 封装起来，并复用于 `guess`、`undo`、`redo` 和序列化，历史记录不再只是难以理解的裸数据。

### 3. 对外暴露副本和 JSON 快照，封装意识较好

- 位置：src/domain/index.js:373-375,508-520,774-779
- 原因：`getGrid()`、`clone()`、`toJSON()` 都避免直接泄漏内部数组引用，说明作者有在控制可变状态的外溢面。

### 4. 胜利判定至少被收敛为派生状态

- 位置：src/node_modules/@sudoku/stores/game.js:7-20
- 原因：虽然没有接入 domain，但 `gameWon` 被收敛到 derived store 中，而不是散落在多个组件事件处理器里，这一点符合 Svelte 的状态派生思路。

## 补充说明

- 按要求未运行测试，也未实际点击浏览器界面；以上结论均基于对 `src/domain/index.js` 及其在 `src/App.svelte`、`src/components/**/*`、`src/node_modules/@sudoku/game.js`、`src/node_modules/@sudoku/stores/*` 中调用链的静态阅读。
- “领域对象未接入真实使用”的判断来自全仓库静态检索：除 `src/domain/index.js` 自身外，没有业务代码 import `createSudoku` / `createGame` / `createGameFromJSON` / `createSudokuFromJSON`。
- “当前游戏业务允许错误录入”的判断来自源码证据而非运行结果：`Keyboard.svelte` 直接写入 `userGrid`，`invalidCells` 对重复数字做冲突高亮，`gameWon` 也依赖‘无空格且无冲突’这一派生条件。
- 本次结论没有评价 `DESIGN.md` 的解释质量，因为你要求只 review `src/domain/*` 及其关联的 Svelte 接入。
