import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Settings } from 'lucide-react';

const MCTSTicTacToe = () => {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState('X');
  const [isRunning, setIsRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [mctsData, setMctsData] = useState({
    tree: {},
    currentNode: null,
    simulations: 0,
    phase: 'idle',
    moveProbabilities: Array(9).fill(0),
    bestMove: null
  });
  const [settings, setSettings] = useState({
    simulationsPerMove: 1000,
    explorationConstant: 1.4,
    speed: 50
  });
  const [showSettings, setShowSettings] = useState(false);

  const intervalRef = useRef(null);
  const mctsRef = useRef(null);

  // Game logic
  const checkWinner = (board) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    
    for (let line of lines) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return board.includes(null) ? null : 'draw';
  };

  const getAvailableMoves = (board) => {
    return board.map((cell, index) => cell === null ? index : null).filter(move => move !== null);
  };

  // MCTS Node class
  class MCTSNode {
    constructor(board, player, move = null, parent = null) {
      this.board = [...board];
      this.player = player;
      this.move = move;
      this.parent = parent;
      this.children = [];
      this.visits = 0;
      this.wins = 0;
      this.untried_moves = getAvailableMoves(board);
    }

    ucb1(explorationConstant) {
      if (this.visits === 0) return Infinity;
      return this.wins / this.visits + explorationConstant * Math.sqrt(Math.log(this.parent.visits) / this.visits);
    }

    selectChild(explorationConstant) {
      return this.children.reduce((best, child) => 
        child.ucb1(explorationConstant) > best.ucb1(explorationConstant) ? child : best
      );
    }

    addChild(move, board, player) {
      const child = new MCTSNode(board, player, move, this);
      this.untried_moves = this.untried_moves.filter(m => m !== move);
      this.children.push(child);
      return child;
    }

    update(result) {
      this.visits++;
      this.wins += result;
    }

    isFullyExpanded() {
      return this.untried_moves.length === 0;
    }

    isTerminal() {
      return checkWinner(this.board) !== null;
    }
  }

  // MCTS Algorithm
  class MCTS {
    constructor(explorationConstant = 1.4) {
      this.explorationConstant = explorationConstant;
      this.root = null;
    }

    search(board, player, iterations, onUpdate) {
      this.root = new MCTSNode(board, player);
      
      for (let i = 0; i < iterations; i++) {
        const node = this.select(this.root);
        const expandedNode = this.expand(node);
        const result = this.simulate(expandedNode);
        this.backpropagate(expandedNode, result);
        
        if (i % 10 === 0) { // Update visualization every 10 simulations
          onUpdate(this.root, i, 'simulation');
        }
      }
      
      return this.getBestMove(this.root);
    }

    select(node) {
      while (!node.isTerminal() && node.isFullyExpanded()) {
        node = node.selectChild(this.explorationConstant);
      }
      return node;
    }

    expand(node) {
      if (node.isTerminal() || node.untried_moves.length === 0) {
        return node;
      }
      
      const move = node.untried_moves[Math.floor(Math.random() * node.untried_moves.length)];
      const newBoard = [...node.board];
      newBoard[move] = node.player;
      const nextPlayer = node.player === 'X' ? 'O' : 'X';
      
      return node.addChild(move, newBoard, nextPlayer);
    }

    simulate(node) {
      let board = [...node.board];
      let player = node.player;
      
      while (checkWinner(board) === null) {
        const moves = getAvailableMoves(board);
        if (moves.length === 0) break;
        
        const move = moves[Math.floor(Math.random() * moves.length)];
        board[move] = player;
        player = player === 'X' ? 'O' : 'X';
      }
      
      const winner = checkWinner(board);
      if (winner === 'draw') return 0.5;
      return winner === 'O' ? 1 : 0; // O is AI player
    }

    backpropagate(node, result) {
      let currentResult = result;
      while (node !== null) {
        node.update(currentResult);
        currentResult = 1 - currentResult;
        node = node.parent;
      }
    }

    getBestMove(node) {
      if (node.children.length === 0) return null;
      return node.children.reduce((best, child) => 
        child.visits > best.visits ? child : best
      ).move;
    }
  }

  // Initialize MCTS
  useEffect(() => {
    mctsRef.current = new MCTS(settings.explorationConstant);
  }, [settings.explorationConstant]);

  // Handle player move
  const handleCellClick = (index) => {
    if (board[index] || gameOver || isRunning || currentPlayer !== 'X') return;
    
    const newBoard = [...board];
    newBoard[index] = 'X';
    setBoard(newBoard);
    setCurrentPlayer('O');
    
    const winner = checkWinner(newBoard);
    if (winner) {
      setWinner(winner);
      setGameOver(true);
    }
  };

  // AI move with MCTS
  const makeAIMove = () => {
    if (gameOver || currentPlayer !== 'O') return;
    
    setIsRunning(true);
    setMctsData(prev => ({ ...prev, simulations: 0, phase: 'starting' }));
    
    // Simple fallback for immediate moves
    const availableMoves = getAvailableMoves(board);
    if (availableMoves.length === 0) {
      setIsRunning(false);
      return;
    }
    
    // Initialize MCTS
    const mcts = new MCTS(settings.explorationConstant);
    let simulationCount = 0;
    const maxSimulations = Math.min(settings.simulationsPerMove, 500); // Cap simulations
    
    const runBatch = () => {
      try {
        const batchSize = Math.min(20, maxSimulations - simulationCount);
        
        // Run batch of simulations
        for (let i = 0; i < batchSize && simulationCount < maxSimulations; i++) {
          // Selection
          let node = mcts.select(mcts.root);
          
          // Expansion
          if (!node.isTerminal() && node.untried_moves.length > 0) {
            const move = node.untried_moves[Math.floor(Math.random() * node.untried_moves.length)];
            const newBoard = [...node.board];
            newBoard[move] = node.player;
            const nextPlayer = node.player === 'X' ? 'O' : 'X';
            node = node.addChild(move, newBoard, nextPlayer);
          }
          
          // Simulation
          const result = mcts.simulate(node);
          
          // Backpropagation
          mcts.backpropagate(node, result);
          
          simulationCount++;
        }
        
        // Update visualization
        const probabilities = Array(9).fill(0);
        let maxVisits = 0;
        
        if (mcts.root.children.length > 0) {
          mcts.root.children.forEach(child => {
            probabilities[child.move] = child.visits;
            maxVisits = Math.max(maxVisits, child.visits);
          });
          
          // Normalize probabilities
          if (maxVisits > 0) {
            for (let i = 0; i < probabilities.length; i++) {
              probabilities[i] = probabilities[i] / mcts.root.visits;
            }
          }
        }
        
        const bestMove = mcts.getBestMove(mcts.root);
        
        setMctsData(prev => ({
          ...prev,
          simulations: simulationCount,
          phase: simulationCount >= maxSimulations ? 'complete' : 'simulation',
          moveProbabilities: probabilities,
          bestMove: bestMove
        }));
        
        // Continue or finish
        if (simulationCount >= maxSimulations) {
          // Make the move
          const finalBestMove = bestMove !== null ? bestMove : availableMoves[0];
          const newBoard = [...board];
          newBoard[finalBestMove] = 'O';
          setBoard(newBoard);
          setCurrentPlayer('X');
          
          const winner = checkWinner(newBoard);
          if (winner) {
            setWinner(winner);
            setGameOver(true);
          }
          
          setIsRunning(false);
          setMctsData(prev => ({ ...prev, phase: 'complete' }));
        } else {
          // Continue with next batch
          setTimeout(runBatch, Math.max(10, 100 - settings.speed));
        }
      } catch (error) {
        console.error('MCTS error:', error);
        // Fallback to random move
        const randomMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
        const newBoard = [...board];
        newBoard[randomMove] = 'O';
        setBoard(newBoard);
        setCurrentPlayer('X');
        setIsRunning(false);
        setMctsData(prev => ({ ...prev, phase: 'error' }));
      }
    };
    
    // Initialize root and start
    mcts.root = new MCTSNode(board, 'O');
    setTimeout(runBatch, 100);
  };

  // Auto-run AI move when it's O's turn
  useEffect(() => {
    if (currentPlayer === 'O' && !gameOver && !isRunning) {
      const timer = setTimeout(makeAIMove, 500);
      return () => clearTimeout(timer);
    }
  }, [currentPlayer, gameOver, isRunning, board]);

  // Reset game
  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setCurrentPlayer('X');
    setIsRunning(false);
    setGameOver(false);
    setWinner(null);
    setMctsData({
      tree: {},
      currentNode: null,
      simulations: 0,
      phase: 'idle',
      moveProbabilities: Array(9).fill(0),
      bestMove: null
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
          MCTS Tic-Tac-Toe Visualization
        </h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Game Board Section */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Game Board</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="px-3 py-1 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                >
                  <Settings size={16} />
                </button>
                <button
                  onClick={resetGame}
                  className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>
            
            {/* Settings Panel */}
            {showSettings && (
              <div className="bg-gray-100 p-4 rounded-lg space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Simulations per Move</label>
                  <input
                    type="range"
                    min="50"
                    max="500"
                    value={Math.min(settings.simulationsPerMove, 500)}
                    onChange={(e) => setSettings(prev => ({ ...prev, simulationsPerMove: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <span className="text-sm text-gray-600">{Math.min(settings.simulationsPerMove, 500)}</span>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Exploration Constant</label>
                  <input
                    type="range"
                    min="0.1"
                    max="3"
                    step="0.1"
                    value={settings.explorationConstant}
                    onChange={(e) => setSettings(prev => ({ ...prev, explorationConstant: parseFloat(e.target.value) }))}
                    className="w-full"
                  />
                  <span className="text-sm text-gray-600">{settings.explorationConstant}</span>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Animation Speed</label>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    value={settings.speed}
                    onChange={(e) => setSettings(prev => ({ ...prev, speed: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <span className="text-sm text-gray-600">{settings.speed}%</span>
                </div>
              </div>
            )}
            
            {/* Game Status */}
            <div className="bg-gray-100 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-medium">
                  {gameOver ? 
                    (winner === 'draw' ? 'Draw!' : `Winner: ${winner}`) :
                    `Current Player: ${currentPlayer}`
                  }
                </span>
                <div className="flex items-center gap-2">
                  {isRunning && (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-sm">AI Thinking...</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {/* Tic-Tac-Toe Board */}
            <div className="grid grid-cols-3 gap-2 w-80 mx-auto">
              {board.map((cell, index) => (
                <button
                  key={index}
                  onClick={() => handleCellClick(index)}
                  disabled={cell || gameOver || isRunning || currentPlayer !== 'X'}
                  className={`
                    w-24 h-24 border-2 border-gray-300 rounded-lg text-2xl font-bold
                    hover:bg-gray-100 transition-colors relative
                    ${cell ? 'cursor-default' : 'cursor-pointer'}
                    ${mctsData.bestMove === index ? 'ring-2 ring-blue-500' : ''}
                  `}
                >
                  {cell}
                  {/* Probability overlay */}
                  {!cell && mctsData.moveProbabilities[index] > 0 && (
                    <div className="absolute inset-0 bg-blue-500 opacity-20 rounded-lg"
                         style={{ opacity: mctsData.moveProbabilities[index] * 0.5 }}>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
          
          {/* MCTS Visualization Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">MCTS Analysis</h2>
            
            {/* Algorithm Status */}
            <div className="bg-gray-100 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Algorithm Status</span>
                <span className={`text-sm px-2 py-1 rounded ${
                  mctsData.phase === 'error' ? 'bg-red-100 text-red-800' :
                  mctsData.phase === 'complete' ? 'bg-green-100 text-green-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {mctsData.phase}
                </span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Simulations: {mctsData.simulations}</span>
                <span>Max: {Math.min(settings.simulationsPerMove, 500)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(mctsData.simulations / Math.min(settings.simulationsPerMove, 500)) * 100}%` }}
                ></div>
              </div>
              {mctsData.phase === 'error' && (
                <p className="text-sm text-red-600 mt-2">Error occurred, using fallback move</p>
              )}
            </div>
            
            {/* Move Probabilities */}
            <div className="bg-gray-100 p-4 rounded-lg">
              <h3 className="font-medium mb-3">Move Probabilities</h3>
              <div className="grid grid-cols-3 gap-2">
                {mctsData.moveProbabilities.map((prob, index) => (
                  <div key={index} className="bg-white p-3 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium">Pos {index + 1}</span>
                      <span className="text-xs text-gray-600">
                        {(prob * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          mctsData.bestMove === index ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${prob * 100}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Best Move Indicator */}
            {mctsData.bestMove !== null && (
              <div className="bg-green-100 p-4 rounded-lg">
                <h3 className="font-medium text-green-800 mb-2">Best Move Analysis</h3>
                <div className="text-sm text-green-700">
                  <p>Current best move: Position {mctsData.bestMove + 1}</p>
                  <p>Confidence: {(mctsData.moveProbabilities[mctsData.bestMove] * 100).toFixed(1)}%</p>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Instructions */}
        <div className="mt-8 bg-blue-50 p-4 rounded-lg">
          <h3 className="font-medium text-blue-800 mb-2">How it works:</h3>
          <div className="text-sm text-blue-700 space-y-1">
            <p>• You play as X, AI plays as O using Monte Carlo Tree Search</p>
            <p>• Watch the AI "think" in real-time as it runs simulations</p>
            <p>• Blue overlays on the board show move probabilities</p>
            <p>• Green highlighting indicates the AI's current best move</p>
            <p>• Adjust settings to see how parameters affect the AI's decision-making</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MCTSTicTacToe;
