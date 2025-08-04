import { BrowserProvider, Contract, parseEther } from 'ethers';
import { createInstance, FhevmInstance } from 'fhevmjs';

export class FHEGameClient {
  private provider: BrowserProvider | null = null;
  private contract: Contract | null = null;
  private fhevmInstance: FhevmInstance | null = null;
  
  constructor(private contractAddress: string, private contractABI: any[]) {}

  async init(): Promise<void> {
    if (!window.ethereum) {
      throw new Error('MetaMask not detected');
    }

    this.provider = new BrowserProvider(window.ethereum);
    await this.provider.send('eth_requestAccounts', []);
    
    const signer = await this.provider.getSigner();
    this.contract = new Contract(this.contractAddress, this.contractABI, signer);
    
    // Инициализируем FHE instance
    this.fhevmInstance = await createInstance({
      chainId: await signer.getChainId(),
      publicKeyId: this.contractAddress,
    });
  }

  async createGame(secretNumber: number, maxAttempts: number, prizeETH: string): Promise<string> {
    if (!this.contract || !this.fhevmInstance) {
      throw new Error('Client not initialized');
    }

    // Шифруем секретное число
    const encryptedSecret = this.fhevmInstance.encrypt8(secretNumber);
    
    const tx = await this.contract.createGame(
      encryptedSecret.handles[0],
      encryptedSecret.inputProof,
      maxAttempts,
      { value: parseEther(prizeETH) }
    );

    return tx.hash;
  }

  async makeGuess(gameId: number, guess: number): Promise<{
    txHash: string;
    result: number;
  }> {
    if (!this.contract || !this.fhevmInstance) {
      throw new Error('Client not initialized');
    }

    // Шифруем догадку
    const encryptedGuess = this.fhevmInstance.encrypt8(guess);
    
    const tx = await this.contract.makeGuess(
      gameId,
      encryptedGuess.handles[0],
      encryptedGuess.inputProof
    );

    const receipt = await tx.wait();
    
    // Дешифруем результат из events или return value
    // Примечание: требует дополнительной обработки для реального проекта
    
    return {
      txHash: tx.hash,
      result: 0 // Placeholder - нужна реальная дешифровка
    };
  }

  async getGameInfo(gameId: number) {
    if (!this.contract) {
      throw new Error('Client not initialized');
    }

    return await this.contract.getGameInfo(gameId);
  }

  async getPlayerAttempts(gameId: number, playerAddress: string): Promise<number> {
    if (!this.contract) {
      throw new Error('Client not initialized');
    }

    return await this.contract.getPlayerAttempts(gameId, playerAddress);
  }
}
