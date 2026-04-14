// src/domain/index.js

// ====================== 类型定义 ======================

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
 * 
 * @typedef {{
 *   getSudoku: () => SudokuLike;
 *   getGrid: () => number[][];
 *   guess: (move: MoveInput) => Move;
 *   undo: () => boolean;
 *   redo: () => boolean;
 *   canUndo: () => boolean;
 *   canRedo: () => boolean;
 *   toJSON: () => GameJSON;
 * }} GameLike
 * 
 * @typedef {Object} MoveInput
 * @property {number} row
 * @property {number} col
 * @property {SudokuValue|null} value
 * 
 * @typedef {Object} SudokuJSON
 * @property {number[][]} grid
 * @property {boolean[][]} givens
 * 
 * @typedef {Object} GameJSON
 * @property {SudokuJSON} current
 * @property {Object[]} history
 * @property {Object[]} redoStack
 */

// ====================== 工厂函数 ======================

/**
 * 创建 Sudoku 领域对象的工厂函数
 * @param {number[][]} input - 9x9的初始盘面
 * @returns {SudokuLike} Sudoku 实例
 */
export function createSudoku(input) {
  return new Sudoku(input);
}

/**
 * 从 JSON 序列化状态恢复 Sudoku 领域对象的工厂函数
 * @param {SudokuJSON} json - 由 sudoku.toJSON() 返回的对象
 * @returns {SudokuLike} Sudoku 实例
 */
export function createSudokuFromJSON(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid JSON for Sudoku');
  }
  if (!Array.isArray(json.grid) || !Array.isArray(json.givens)) {
    throw new Error('JSON must contain grid and givens arrays');
  }
  return new Sudoku(json.grid, json.givens);
}

/**
 * 创建 Game 领域对象的工厂函数
 * @param {Object} options - 配置选项
 * @param {SudokuLike} options.sudoku - Sudoku 实例
 * @returns {GameLike} Game 实例
 */
export function createGame({ sudoku }) {
  if (!sudoku || typeof sudoku.getGrid !== 'function' || typeof sudoku.guess !== 'function') {
    throw new Error('Invalid sudoku object provided');
  }
  return new Game(sudoku);
}

/**
 * 从 JSON 序列化状态恢复 Game 领域对象的工厂函数
 * @param {GameJSON} json - 由 game.toJSON() 返回的对象
 * @returns {GameLike} Game 实例
 */
export function createGameFromJSON(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid JSON for Game');
  }
  
  // 从JSON恢复Sudoku
  const sudoku = createSudokuFromJSON(json.current);
  const game = new Game(sudoku);
  
  // 通过公共接口恢复历史状态，避免直接操作私有字段
  game.restoreState(json.history || [], json.redoStack || []);
  
  return game;
}

// ====================== Move 类 ======================

/**
 * Move 类 - 表示一次数独操作的值对象
 */
class Move {
  /**
   * @param {number} row - 行索引 (0-8)
   * @param {number} col - 列索引 (0-8)
   * @param {SudokuValue} oldValue - 操作前的值
   * @param {SudokuValue} newValue - 操作后的值
   */
  constructor(row, col, oldValue, newValue) {
    this.row = row;
    this.col = col;
    this.oldValue = oldValue;  // 操作前的值
    this.newValue = newValue;  // 操作后的值
  }

  /**
   * 判断操作是否有效（值是否改变）
   * @returns {boolean}
   */
  isValid() {
    return this.oldValue !== this.newValue;
  }

  /**
   * 判断是否是擦除操作
   * @returns {boolean}
   */
  isErase() {
    return this.newValue === 0;
  }

  /**
   * 获取逆操作
   * @returns {Move} 逆操作
   */
  getReverse() {
    return new Move(this.row, this.col, this.newValue, this.oldValue);
  }

  /**
   * 转换为JSON格式
   * @returns {Object}
   */
  toJSON() {
    return {
      row: this.row,
      col: this.col,
      oldValue: this.oldValue,
      newValue: this.newValue
    };
  }
}

// ====================== Sudoku 类 ======================

/**
 * Sudoku 类 - 数独棋盘领域对象
 * 职责：棋盘状态管理、规则验证、棋盘操作
 */
class Sudoku {
  /**
   * @param {SudokuValue[][]} grid - 9x9初始盘面
   * @param {boolean[][]} [givens] - 初始给定格子的标记数组
   */
  constructor(grid, givens) {
    // 验证并初始化网格
    this._grid = this._initializeGrid(grid, givens);
    
    // 验证网格的完整性
    this._validateGridRules();
  }

  /**
   * 初始化网格，包括验证和构建给定格子标记
   * @param {any} grid - 源网格
   * @param {boolean[][]} [existingGivens] - 现有的给定格子标记
   * @returns {SudokuValue[][]} 标准化后的网格
   */
  _initializeGrid(grid, existingGivens) {
    // 验证网格格式
    this._validateGridFormat(grid);
    
    // 标准化网格
    const normalizedGrid = this._normalizeGrid(grid);
    
    // 构建或验证给定格子标记
    this._givens = existingGivens ? 
      this._validateGivens(existingGivens, normalizedGrid) : 
      this._buildGivens(normalizedGrid);
    
    return normalizedGrid;
  }

  /**
   * 验证网格格式
   * @param {any} grid - 待验证的网格
   * @throws {Error} 如果网格格式无效
   */
  _validateGridFormat(grid) {
    if (!Array.isArray(grid) || grid.length !== 9) {
      throw new Error('网格必须是9x9数组');
    }
    
    for (let row = 0; row < 9; row++) {
      if (!Array.isArray(grid[row]) || grid[row].length !== 9) {
        throw new Error('网格必须是9x9数组');
      }
    }
  }

  /**
   * 验证给定格子标记
   * @param {boolean[][]} givens - 给定格子标记
   * @param {SudokuValue[][]} grid - 网格
   * @returns {boolean[][]} 验证后的给定格子标记
   */
  _validateGivens(givens, grid) {
    if (!Array.isArray(givens) || givens.length !== 9) {
      throw new Error('givens必须是9x9数组');
    }
    
    const validatedGivens = [];
    
    for (let row = 0; row < 9; row++) {
      if (!Array.isArray(givens[row]) || givens[row].length !== 9) {
        throw new Error('givens必须是9x9数组');
      }
      
      validatedGivens[row] = [];
      for (let col = 0; col < 9; col++) {
        const isGiven = Boolean(givens[row][col]);
        const cellValue = grid[row][col];
        
        // 如果标记为给定格子，但格子为空，则是无效状态
        if (isGiven && cellValue === 0) {
          throw new Error('给定格子不能为空');
        }
        
        validatedGivens[row][col] = isGiven;
      }
    }
    
    return validatedGivens;
  }

  /**
   * 根据网格构建给定格子标记
   * @param {SudokuValue[][]} grid - 网格
   * @returns {boolean[][]} 给定格子标记
   */
  _buildGivens(grid) {
    const givens = [];
    
    for (let row = 0; row < 9; row++) {
      givens[row] = [];
      for (let col = 0; col < 9; col++) {
        givens[row][col] = grid[row][col] !== 0;
      }
    }
    
    return givens;
  }

  /**
   * 标准化网格：确保所有值都是合法的数独值
   * @param {any[][]} grid - 源网格
   * @returns {SudokuValue[][]} 标准化后的网格
   */
  _normalizeGrid(grid) {
    const normalized = [];
    
    for (let row = 0; row < 9; row++) {
      normalized[row] = [];
      for (let col = 0; col < 9; col++) {
        const value = grid[row][col];
        normalized[row][col] = this._normalizeCellValue(value);
      }
    }
    
    return normalized;
  }

  /**
   * 标准化单个格子的值
   * @param {any} value - 原始值
   * @returns {SudokuValue} 标准化后的值
   */
  _normalizeCellValue(value) {
    // 处理null/undefined
    if (value === null || value === undefined || value === '') {
      return 0;
    }
    
    // 转换为数字
    const num = Number(value);
    
    // 验证是否为整数且在0-9范围内
    if (!Number.isInteger(num) || num < 0 || num > 9) {
      throw new Error(`单元格值必须是0-9之间的整数，但得到了: ${value}`);
    }
    
    return /** @type {SudokuValue} */ (num);
  }

  /**
   * 验证数独规则
   * @throws {Error} 如果网格违反数独规则
   */
  _validateGridRules() {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const value = this._grid[row][col];
        if (value !== 0) {
          if (!this._isValueValid(row, col, value)) {
            throw new Error(`无效的数独网格: 位置(${row}, ${col})的值${value}违反数独规则`);
          }
        }
      }
    }
  }

  /**
   * 检查在指定位置填入数字是否合法
   * @param {number} row - 行索引
   * @param {number} col - 列索引
   * @param {SudokuValue} value - 要检查的值
   * @returns {boolean} 是否合法
   */
  _isValueValid(row, col, value) {
    if (value === 0) {
      return true; // 擦除操作总是合法的
    }
    
    // 检查行
    for (let c = 0; c < 9; c++) {
      if (c !== col && this._grid[row][c] === value) {
        return false;
      }
    }
    
    // 检查列
    for (let r = 0; r < 9; r++) {
      if (r !== row && this._grid[r][col] === value) {
        return false;
      }
    }
    
    // 检查3x3宫
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    
    for (let r = boxRow; r < boxRow + 3; r++) {
      for (let c = boxCol; c < boxCol + 3; c++) {
        if (r !== row && c !== col && this._grid[r][c] === value) {
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * 获取当前盘面的副本
   * @returns {number[][]} 9x9盘面
   */
  getGrid() {
    return this._grid.map(row => [...row]);
  }

  /**
   * 检查指定格子是否是初始给定格子
   * @param {number} row - 行索引
   * @param {number} col - 列索引
   * @returns {boolean}
   */
  isGiven(row, col) {
    this._validateCoordinates(row, col);
    return this._givens[row][col];
  }

  /**
   * 检查在指定位置填入数字是否合法
   * @param {number} row - 行索引
   * @param {number} col - 列索引
   * @param {SudokuValue} value - 要检查的值
   * @returns {boolean} 是否合法
   */
  isMoveValid(row, col, value) {
    this._validateCoordinates(row, col);
    const normalizedValue = this._normalizeCellValue(value);
    return this._isValueValid(row, col, normalizedValue);
  }

  /**
   * 验证坐标
   * @param {number} row - 行索引
   * @param {number} col - 列索引
   * @throws {Error} 如果坐标无效
   */
  _validateCoordinates(row, col) {
    if (!Number.isInteger(row) || row < 0 || row > 8 ||
        !Number.isInteger(col) || col < 0 || col > 8) {
      throw new Error(`无效的坐标: row=${row}, col=${col}`);
    }
  }

  /**
   * 在指定位置填入数字
   * @param {MoveInput} move - 移动操作
   * @returns {Move} 表示本次操作的Move对象
   * @throws {Error} 如果操作无效
   */
  guess(move) {
    const { row, col, value } = move;
    
    // 验证坐标
    this._validateCoordinates(row, col);
    
    // 验证和标准化值
    const normalizedValue = this._normalizeCellValue(value);
    
    // 检查是否是给定格子
    if (this.isGiven(row, col)) {
      throw new Error(`不能修改给定格子: (${row}, ${col})`);
    }
    
    // 检查移动是否合法
    if (!this._isValueValid(row, col, normalizedValue)) {
      throw new Error(`非法移动: 在位置(${row}, ${col})填入${normalizedValue}违反数独规则`);
    }
    
    const oldValue = this._grid[row][col];
    
    // 创建Move对象
    const moveObj = new Move(row, col, oldValue, normalizedValue);
    
    // 如果值没有改变，直接返回
    if (!moveObj.isValid()) {
      return moveObj;
    }
    
    // 应用操作
    this._grid[row][col] = normalizedValue;
    
    return moveObj;
  }

  /**
   * 检查数独是否完成
   * @returns {boolean}
   */
  isComplete() {
    // 检查所有格子是否已填
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (this._grid[row][col] === 0) {
          return false;
        }
      }
    }
    
    // 验证数独规则
    for (let i = 0; i < 9; i++) {
      const rowSet = new Set();
      const colSet = new Set();
      const boxSet = new Set();
      
      for (let j = 0; j < 9; j++) {
        // 检查行
        const rowVal = this._grid[i][j];
        if (rowSet.has(rowVal)) {
          return false;
        }
        rowSet.add(rowVal);
        
        // 检查列
        const colVal = this._grid[j][i];
        if (colSet.has(colVal)) {
          return false;
        }
        colSet.add(colVal);
        
        // 检查3x3宫
        const boxRow = 3 * Math.floor(i / 3) + Math.floor(j / 3);
        const boxCol = 3 * (i % 3) + (j % 3);
        const boxVal = this._grid[boxRow][boxCol];
        if (boxSet.has(boxVal)) {
          return false;
        }
        boxSet.add(boxVal);
      }
    }
    
    return true;
  }

  /**
   * 创建当前Sudoku的深拷贝
   * @returns {SudokuLike} 新的Sudoku实例
   */
  clone() {
    return new Sudoku(this._grid, this._givens);
  }

  /**
   * 序列化为JSON格式
   * @returns {SudokuJSON} 可序列化的表示
   */
  toJSON() {
    return {
      grid: this.getGrid(),
      givens: this._givens.map(row => [...row])
    };
  }

  /**
   * 转换为字符串表示（用于调试）
   * @returns {string}
   */
  toString() {
    let result = '';
    for (let row = 0; row < 9; row++) {
      if (row > 0 && row % 3 === 0) {
        result += '------+-------+------\n';
      }
      for (let col = 0; col < 9; col++) {
        if (col > 0 && col % 3 === 0) {
          result += '| ';
        }
        const cell = this._grid[row][col];
        const display = cell === 0 ? '.' : cell;
        result += (this.isGiven(row, col) ? `\x1b[1m${display}\x1b[0m` : display) + ' ';
      }
      result += '\n';
    }
    return result;
  }
}

// ====================== Game 类 ======================

/**
 * Game 类 - 游戏会话领域对象
 * 职责：游戏流程管理、历史记录、撤销/重做
 */
class Game {
  /**
   * @param {SudokuLike} sudoku - Sudoku实例
   */
  constructor(sudoku) {
    if (!sudoku || 
        typeof sudoku.getGrid !== 'function' || 
        typeof sudoku.guess !== 'function' ||
        typeof sudoku.isGiven !== 'function') {
      throw new Error('必须提供有效的Sudoku实例');
    }
    
    this._sudoku = sudoku.clone(); // 深拷贝，避免共享引用
    this._history = [];            // 历史记录栈
    this._redoStack = [];          // 重做栈
  }

  /**
   * 恢复游戏状态（用于反序列化）
   * @param {Object[]} history - 历史记录
   * @param {Object[]} redoStack - 重做栈
   */
  restoreState(history, redoStack) {
    if (!Array.isArray(history) || !Array.isArray(redoStack)) {
      throw new Error('history和redoStack必须是数组');
    }
    
    // 验证并恢复历史记录
    this._history = history.map(moveData => {
      if (!this._isValidMoveData(moveData)) {
        throw new Error('无效的历史记录数据');
      }
      return new Move(moveData.row, moveData.col, moveData.oldValue, moveData.newValue);
    });
    
    // 验证并恢复重做栈
    this._redoStack = redoStack.map(moveData => {
      if (!this._isValidMoveData(moveData)) {
        throw new Error('无效的重做栈数据');
      }
      return new Move(moveData.row, moveData.col, moveData.oldValue, moveData.newValue);
    });
  }

  /**
   * 验证移动数据
   * @param {any} moveData - 移动数据
   * @returns {boolean}
   */
  _isValidMoveData(moveData) {
    return moveData && 
           typeof moveData === 'object' &&
           typeof moveData.row === 'number' &&
           typeof moveData.col === 'number' &&
           typeof moveData.oldValue === 'number' &&
           typeof moveData.newValue === 'number' &&
           moveData.row >= 0 && moveData.row <= 8 &&
           moveData.col >= 0 && moveData.col <= 8 &&
           moveData.oldValue >= 0 && moveData.oldValue <= 9 &&
           moveData.newValue >= 0 && moveData.newValue <= 9;
  }

  /**
   * 获取当前数独对象
   * @returns {SudokuLike} 当前数独的副本
   */
  getSudoku() {
    return this._sudoku.clone(); // 返回副本，防止外部修改内部状态
  }

  /**
   * 获取当前盘面
   * @returns {number[][]} 9x9盘面
   */
  getGrid() {
    return this._sudoku.getGrid();
  }

  /**
   * 获取指定格子是否是初始给定格子
   * @param {number} row - 行索引
   * @param {number} col - 列索引
   * @returns {boolean}
   */
  isGiven(row, col) {
    return this._sudoku.isGiven(row, col);
  }

  /**
   * 检查在指定位置填入数字是否合法
   * @param {number} row - 行索引
   * @param {number} col - 列索引
   * @param {SudokuValue} value - 要检查的值
   * @returns {boolean} 是否合法
   */
  isMoveValid(row, col, value) {
    return this._sudoku.isMoveValid(row, col, value);
  }

  /**
   * 执行猜数操作
   * @param {MoveInput} move - 移动操作
   * @returns {Move} 执行的Move对象
   */
  guess(move) {
    // 执行操作
    const moveObj = this._sudoku.guess(move);
    
    // 如果操作有效，添加到历史记录
    if (moveObj.isValid()) {
      this._history.push(moveObj);
      this._redoStack = []; // 新操作后清空重做栈
    }
    
    return moveObj;
  }

  /**
   * 撤销最后一次操作
   * @returns {boolean} 是否成功撤销
   */
  undo() {
    if (this._history.length === 0) {
      return false;
    }
    
    const lastMove = this._history.pop();
    
    // 跳过对给定格子的撤销
    if (this._sudoku.isGiven(lastMove.row, lastMove.col)) {
      return this.undo(); // 递归尝试撤销上一个操作
    }
    
    const reverseMove = lastMove.getReverse();
    
    // 应用逆操作
    this._sudoku.guess({
      row: reverseMove.row,
      col: reverseMove.col,
      value: reverseMove.newValue
    });
    
    // 添加到重做栈
    this._redoStack.push(lastMove);
    
    return true;
  }

  /**
   * 重做最后一次撤销的操作
   * @returns {boolean} 是否成功重做
   */
  redo() {
    if (this._redoStack.length === 0) {
      return false;
    }
    
    const redoMove = this._redoStack.pop();
    
    // 跳过对给定格子的重做
    if (this._sudoku.isGiven(redoMove.row, redoMove.col)) {
      return this.redo(); // 递归尝试重做下一个操作
    }
    
    // 重新执行操作
    this._sudoku.guess({
      row: redoMove.row,
      col: redoMove.col,
      value: redoMove.newValue
    });
    
    // 添加回历史记录
    this._history.push(redoMove);
    
    return true;
  }

  /**
   * 检查是否可以撤销
   * @returns {boolean}
   */
  canUndo() {
    return this._history.some(move => !this._sudoku.isGiven(move.row, move.col));
  }

  /**
   * 检查是否可以重做
   * @returns {boolean}
   */
  canRedo() {
    return this._redoStack.some(move => !this._sudoku.isGiven(move.row, move.col));
  }

  /**
   * 获取历史记录长度
   * @returns {number}
   */
  getHistoryLength() {
    return this._history.length;
  }

  /**
   * 获取重做栈长度
   * @returns {number}
   */
  getRedoStackLength() {
    return this._redoStack.length;
  }

  /**
   * 检查游戏是否完成
   * @returns {boolean}
   */
  isComplete() {
    return this._sudoku.isComplete();
  }

  /**
   * 序列化为JSON格式
   * @returns {GameJSON} 可序列化的表示
   */
  toJSON() {
    return {
      current: this._sudoku.toJSON(),
      history: this._history.map(move => move.toJSON()),
      redoStack: this._redoStack.map(move => move.toJSON())
    };
  }
}
