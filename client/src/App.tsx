import React, { useState, useEffect } from 'react';
import { FHEGameClient } from './utils/fhe';
import contractABI from './contracts/EncryptedGuessGame.json';

const CONTRACT_ADDRESS = "0x..."; // Адрес развернутого контракта

interface GameInfo {
  host: string;
  startTime: bigint;
  maxAttempts: bigint;
  state: number;
  winner: string;
  prize: bigint;
}

function App() {
  const [client, setClient] = useState<FHEGameClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [currentAccount, setCurrentAccount] = useState<string>('');
  
  // Состояние для создания игры
  const [secretNumber, setSecretNumber] = useState<number>(50);
  const [maxAttempts, setMaxAttempts] = useState<number>(10);
  const [prizeAmount, setPrizeAmount] = useState<string>('0.1');
  
  // Состояние для игры
  const [gameId, setGameId] = useState<number>(0);
  const [guess, setGuess] = useState<number>(50);
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);
  const [playerAttempts, setPlayerAttempts] = useState<number>(0);
  const [gameResult, setGameResult] = useState<string>('');
  
  // Статусы
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    initClient();
  }, []);

  const initClient = async () => {
    try {
      const gameClient = new FHEGameClient(CONTRACT_ADDRESS, contractABI.abi);
      await gameClient.init();
      setClient(gameClient);
      setConnected(true);
      
      // Получаем текущий аккаунт
      const provider = new (window as any).ethereum.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      setCurrentAccount(await signer.getAddress());
    } catch (err) {
      setError('Ошибка подключения к кошельку: ' + (err as Error).message);
    }
  };

  const handleCreateGame = async () => {
    if (!client) return;
    
    setLoading(true);
    setError('');
    
    try {
      const txHash = await client.createGame(secretNumber, maxAttempts, prizeAmount);
      setGameResult(`Игра создана! Хэш транзакции: ${txHash}`);
    } catch (err) {
      setError('Ошибка создания игры: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleMakeGuess = async () => {
    if (!client) return;
    
    setLoading(true);
    setError('');
    
    try {
      const result = await client.makeGuess(gameId, guess);
      
      const resultTexts = {
        0: '🎉 Правильно! Вы угадали!',
        1: '📉 Ваше число меньше загаданного',
        2: '📈 Ваше число больше загаданного'
      };
      
      setGameResult(resultTexts[result.result as 0 | 1 | 2] || 'Неизвестный результат');
      
      // Обновляем количество попыток
      const attempts = await client.getPlayerAttempts(gameId, currentAccount);
      setPlayerAttempts(attempts);
      
    } catch (err) {
      setError('Ошибка при попытке угадать: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadGameInfo = async () => {
    if (!client) return;
    
    try {
      const info = await client.getGameInfo(gameId);
      setGameInfo(info);
      
      const attempts = await client.getPlayerAttempts(gameId, currentAccount);
      setPlayerAttempts(attempts);
    } catch (err) {
      setError('Ошибка загрузки информации об игре: ' + (err as Error).message);
    }
  };

  if (!connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-xl">
          <h1 className="text-2xl font-bold mb-4">Подключение к кошельку</h1>
          {error && <p className="text-red-600 mb-4">{error}</p>}
          <button 
            onClick={initClient}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            Подключить MetaMask
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🔐 Конфиденциальная игра "Угадай число"
          </h1>
          <p className="text-blue-200">
            Используется полностью гомоморфное шифрование (FHE)
          </p>
          <p className="text-sm text-blue-300 mt-2">
            Аккаунт: {currentAccount.slice(0, 6)}...{currentAccount.slice(-4)}
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Создание игры */}
          <div className="bg-white p-6 rounded-lg shadow-xl">
            <h2 className="text-xl font-bold mb-4">Создать игру</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Загадайте число (1-100):
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={secretNumber}
                  onChange={(e) => setSecretNumber(Number(e.target.value))}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  Максимум попыток:
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(Number(e.target.value))}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  Приз (ETH):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={prizeAmount}
                  onChange={(e) => setPrizeAmount(e.target.value)}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <button
                onClick={handleCreateGame}
                disabled={loading}
                className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Создание...' : 'Создать игру'}
              </button>
            </div>
          </div>

          {/* Участие в игре */}
          <div className="bg-white p-6 rounded-lg shadow-xl">
            <h2 className="text-xl font-bold mb-4">Играть</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  ID игры:
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    value={gameId}
                    onChange={(e) => setGameId(Number(e.target.value))}
                    className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={loadGameInfo}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    Загрузить
                  </button>
                </div>
              </div>

              {gameInfo && (
                <div className="bg-gray-50 p-3 rounded text-sm">
                  <p><strong>Хост:</strong> {gameInfo.host.slice(0, 6)}...{gameInfo.host.slice(-4)}</p>
                  <p><strong>Макс. попыток:</strong> {gameInfo.maxAttempts.toString()}</p>
                  <p><strong>Приз:</strong> {Number(gameInfo.prize) / 1e18} ETH</p>
                  <p><strong>Ваши попытки:</strong> {playerAttempts}</p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  Ваша догадка (1-100):
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={guess}
                  onChange={(e) => setGuess(Number(e.target.value))}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <button
                onClick={handleMakeGuess}
                disabled={loading || !gameInfo}
                className="w-full bg-purple-600 text-white py-2 rounded hover:bg-purple-700 disabled:opacity-50"
              >
                {loading ? 'Отправка...' : 'Угадать!'}
              </button>
            </div>
          </div>
        </div>

        {/* Результаты и ошибки */}
        {(gameResult || error) && (
          <div className="mt-6 bg-white p-4 rounded-lg shadow-xl">
            {error && (
              <div className="text-red-600 font-medium">
                ❌ {error}
              </div>
            )}
            {gameResult && (
              <div className="text-green-600 font-medium">
                {gameResult}
              </div>
            )}
          </div>
        )}

        {/* Информация о FHE */}
        <div className="mt-8 bg-white/10 text-white p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-2">🔒 О технологии FHE</h3>
          <p className="text-sm text-blue-200">
            Эта игра использует полностью гомоморфное шифрование (FHE), которое позволяет 
            выполнять вычисления на зашифрованных данных без их расшифровки. Ваши догадки 
            и загаданное число остаются конфиденциальными на всем протяжении игры!
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
