DESIGN.md - 数独领域对象设计文档
改进概述
本次作业在原有代码基础上，对领域对象的设计进行了多项重要改进，重点解决了原始代码中存在的业务建模缺陷、封装不完整和输入验证不足等问题。
改进点详细说明
1. 核心业务规则强化
问题：原始Sudoku类的guess方法没有执行数独规则校验，允许非法盘面生成。
改进：
在Sudoku.guess()方法中添加完整的规则校验
通过私有方法_isValueValid()检查行、列、3x3宫的冲突
确保领域对象能够维护数独的核心不变量
对非法移动抛出清晰的错误信息
代码示例：
// 检查在指定位置填入数字是否合法
_isValueValid(row, col, value) {
  if (value === 0) return true; // 擦除操作总是合法的
  
  // 检查行冲突
  for (let c = 0; c < 9; c++) {
    if (c !== col && this._grid[row][c] === value) return false;
  }
  
  // 检查列冲突
  for (let r = 0; r < 9; r++) {
    if (r !== row && this._grid[r][col] === value) return false;
  }
  
  // 检查3x3宫冲突
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if (r !== row && c !== col && this._grid[r][c] === value) return false;
    }
  }
  
  return true;
}
2. 题面初始格与玩家输入的区分
问题：没有区分题面初始格和玩家输入格，题目给定数字可被修改。
改进：
添加_givens属性，标记哪些格子是初始给定的不可编辑格
在构造时自动构建给定格子标记
添加isGiven()公共方法检查格子是否可编辑
在guess()方法中验证并阻止修改给定格子
在undo()/redo()中自动跳过给定格子的操作
代码示例：
// 新增构造函数逻辑
constructor(grid, givens) {
  this._grid = this._initializeGrid(grid, givens);
  this._validateGridRules(); // 验证初始网格的数独规则
}

// 判断是否是给定格子
isGiven(row, col) {
  this._validateCoordinates(row, col);
  return this._givens[row][col];
}

// 猜测时检查是否为给定格子
if (this.isGiven(row, col)) {
  throw new Error(`不能修改给定格子: (${row}, ${col})`);
}
3. 严格的输入验证
问题：输入校验过宽，无法保证棋盘数据合法性。
改进：
新增_normalizeCellValue()方法，严格验证输入必须是0-9的整数
构造时验证网格的完整性，确保不违反数独规则
添加坐标验证方法_validateCoordinates()
对NaN、小数、非整数等无效输入抛出明确错误
在构造时深度验证整个数独网格的合法性
代码示例：
_normalizeCellValue(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0 || num > 9) {
    throw new Error(`单元格值必须是0-9之间的整数，但得到了: ${value}`);
  }
  
  return /** @type {SudokuValue} */ (num);
}
4. 反序列化的封装改进
问题：工厂函数直接操作私有字段，破坏封装边界。
改进：
在Game类中新增公共方法restoreState()
工厂函数通过公共接口恢复状态，而非直接操作_history和_redoStack
添加对反序列化数据的验证逻辑
保持封装性，降低耦合度
代码示例：
// Game类中的新方法
restoreState(history, redoStack) {
  if (!Array.isArray(history) || !Array.isArray(redoStack)) {
    throw new Error('history和redoStack必须是数组');
  }
  
  this._history = history.map(moveData => {
    if (!this._isValidMoveData(moveData)) {
      throw new Error('无效的历史记录数据');
    }
    return new Move(moveData.row, moveData.col, moveData.oldValue, moveData.newValue);
  });
  
  this._redoStack = redoStack.map(moveData => {
    if (!this._isValidMoveData(moveData)) {
      throw new Error('无效的重做栈数据');
    }
    return new Move(moveData.row, moveData.col, moveData.oldValue, moveData.newValue);
  });
}
5. 接口契约明确化
问题：工厂函数参数契约与构造函数真实需求不一致。
改进：
在文件顶部添加详细的JSDoc类型定义
工厂函数完整验证Sudoku实例的所有必需方法
明确接口契约，提高代码可读性和可维护性
统一错误处理和信息提示
代码示例：
// 添加类型定义
/**
 * @typedef {0|1|2|3|4|5|6|7|8|9} SudokuValue
 * @typedef {{
 *   getGrid: () => number[][];
 *   guess: (move: MoveInput) => Move;
 *   isGiven: (row: number, col: number) => boolean;
 *   isMoveValid: (row: number, col: number, value: SudokuValue) => boolean;
 *   isComplete: () => boolean;
 *   clone: () => SudokuLike;
 *   toJSON: () => SudokuJSON;
 *   toString: () => string;
 * }} SudokuLike
 */
6. 撤销/重做逻辑的增强
问题：撤销/重做操作没有考虑给定格子的特殊处理。
改进：
在undo()/redo()中递归跳过对给定格子的操作
改进canUndo()/canRedo()逻辑，只统计可撤销/重做的操作
添加getHistoryLength()和getRedoStackLength()辅助方法
确保只有玩家操作可以撤销/重做
代码示例：
undo() {
  if (this._history.length === 0) return false;
  
  const lastMove = this._history.pop();
  if (this._sudoku.isGiven(lastMove.row, lastMove.col)) {
    return this.undo(); // 递归尝试撤销上一个操作
  }
  
  // ... 执行撤销逻辑
}
7. 调试和可观察性改进
问题：调试信息不够丰富。
改进：
改进toString()方法，用ANSI转义码加粗显示给定格子
在toJSON()中同时序列化网格和给定格子信息
添加更多辅助方法，如isMoveValid()、isComplete()等
提供更清晰的错误消息和调试信息
设计原则遵循
单一职责原则
Sudoku类：专注数独棋盘的状态管理和规则验证
Game类：专注游戏流程、历史记录和撤销/重做
Move类：作为值对象，表示一次操作
开闭原则
通过工厂函数创建对象，便于扩展
公共接口稳定，内部实现可修改
里氏替换原则
所有子类/实现类都能正确替换父类/接口
工厂函数返回的对象都满足类型契约
接口隔离原则
接口定义清晰，职责分明
客户端不依赖不需要的接口
依赖倒置原则
高层模块不依赖低层模块，都依赖抽象
工厂函数提供依赖注入的能力
序列化格式
改进后的序列化格式包含完整的状态信息：
{
  "current": {
    "grid": [[...]],       // 9x9 当前网格
    "givens": [[...]]      // 9x9 给定格子标记
  },
  "history": [...],       // 历史记录
  "redoStack": [...]      // 重做栈
}
使用示例
// 创建数独实例
const puzzle = [
  [5, 3, 0, 0, 7, 0, 0, 0, 0],
  [6, 0, 0, 1, 9, 5, 0, 0, 0],
  [0, 9, 8, 0, 0, 0, 0, 6, 0],
  [8, 0, 0, 0, 6, 0, 0, 0, 3],
  [4, 0, 0, 8, 0, 3, 0, 0, 1],
  [7, 0, 0, 0, 2, 0, 0, 0, 6],
  [0, 6, 0, 0, 0, 0, 2, 8, 0],
  [0, 0, 0, 4, 1, 9, 0, 0, 5],
  [0, 0, 0, 0, 8, 0, 0, 7, 9]
];

const sudoku = createSudoku(puzzle);
const game = createGame({ sudoku });

// 尝试非法移动会抛出错误
try {
  game.guess({ row: 0, col: 0, value: 1 }); // 尝试修改给定格子
} catch (error) {
  console.error(error.message); // "不能修改给定格子: (0, 0)"
}

// 序列化和反序列化
const json = game.toJSON();
const restoredGame = createGameFromJSON(json);