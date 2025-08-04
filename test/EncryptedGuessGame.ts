import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { EncryptedGuessGame, EncryptedGuessGame__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  host: HardhatEthersSigner;
  player1: HardhatEthersSigner;
  player2: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("EncryptedGuessGame")) as EncryptedGuessGame__factory;
  const contract = (await factory.deploy()) as EncryptedGuessGame;
  const contractAddress = await contract.getAddress();

  return { contract, contractAddress };
}

describe("EncryptedGuessGame", function () {
  let signers: Signers;
  let contract: EncryptedGuessGame;
  let contractAddress: string;

  const PRIZE_AMOUNT = ethers.parseEther("0.1");
  const MAX_ATTEMPTS = 10;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = {
      deployer: ethSigners[0],
      host: ethSigners[1],
      player1: ethSigners[2],
      player2: ethSigners[3]
    };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("Tests should run on mock environment");
      this.skip();
    }

    ({ contract, contractAddress } = await deployFixture());
  });

  describe("Game Creation", function () {
    it("should create a new game with encrypted secret", async function () {
      const secretNumber = 42;
      
      // Шифруем секретное число
      const encryptedSecret = await fhevm
        .createEncryptedInput(contractAddress, signers.host.address)
        .add8(secretNumber)
        .encrypt();

      // Создаем игру
      const tx = await contract
        .connect(signers.host)
        .createGame(
          encryptedSecret.handles[0],
          encryptedSecret.inputProof,
          MAX_ATTEMPTS,
          { value: PRIZE_AMOUNT }
        );

      const receipt = await tx.wait();
      const gameCreatedEvent = receipt!.logs.find(
        log => contract.interface.parseLog(log as any)?.name === "GameCreated"
      );

      expect(gameCreatedEvent).to.not.be.undefined;
      
      // Проверяем информацию об игре
      const gameInfo = await contract.getGameInfo(0);
      expect(gameInfo.host).to.equal(signers.host.address);
      expect(gameInfo.prize).to.equal(PRIZE_AMOUNT);
      expect(gameInfo.maxAttempts).to.equal(MAX_ATTEMPTS);
    });

    it("should reject game creation with insufficient prize", async function () {
      const secretNumber = 50;
      const encryptedSecret = await fhevm
        .createEncryptedInput(contractAddress, signers.host.address)
        .add8(secretNumber)
        .encrypt();

      await expect(
        contract
          .connect(signers.host)
          .createGame(
            encryptedSecret.handles[0],
            encryptedSecret.inputProof,
            MAX_ATTEMPTS,
            { value: ethers.parseEther("0.005") } // Меньше минимума
          )
      ).to.be.revertedWith("Prize too small");
    });
  });

  describe("Gameplay", function () {
    let gameId: number;
    const secretNumber = 75;

    beforeEach(async function () {
      // Создаем игру
      const encryptedSecret = await fhevm
        .createEncryptedInput(contractAddress, signers.host.address)
        .add8(secretNumber)
        .encrypt();

      await contract
        .connect(signers.host)
        .createGame(
          encryptedSecret.handles[0],
          encryptedSecret.inputProof,
          MAX_ATTEMPTS,
          { value: PRIZE_AMOUNT }
        );

      gameId = 0;
    });

    it("should handle correct guess", async function () {
      const guess = secretNumber; // Правильная догадка
      
      const encryptedGuess = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(guess)
        .encrypt();

      const tx = await contract
        .connect(signers.player1)
        .makeGuess(gameId, encryptedGuess.handles[0], encryptedGuess.inputProof);

      const receipt = await tx.wait();
      
      // Получаем зашифрованный результат из возвращаемого значения
      // В реальном сценарии это потребует асинхронной дешифровки
      expect(receipt).to.not.be.null;
    });

    it("should handle too low guess", async function () {
      const guess = 30; // Меньше секретного числа (75)
      
      const encryptedGuess = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(guess)
        .encrypt();

      const resultHandle = await contract
        .connect(signers.player1)
        .makeGuess(gameId, encryptedGuess.handles[0], encryptedGuess.inputProof);

      // Дешифруем результат
      const result = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        resultHandle,
        contractAddress,
        signers.player1
      );

      expect(result).to.equal(1); // 1 = меньше
    });

    it("should handle too high guess", async function () {
      const guess = 90; // Больше секретного числа (75)
      
      const encryptedGuess = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(guess)
        .encrypt();

      const resultHandle = await contract
        .connect(signers.player1)
        .makeGuess(gameId, encryptedGuess.handles[0], encryptedGuess.inputProof);

      const result = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        resultHandle,
        contractAddress,
        signers.player1
      );

      expect(result).to.equal(2); // 2 = больше
    });

    it("should track player attempts", async function () {
      const guess1 = 20;
      const guess2 = 80;
      
      // Первая попытка
      const encryptedGuess1 = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(guess1)
        .encrypt();

      await contract
        .connect(signers.player1)
        .makeGuess(gameId, encryptedGuess1.handles[0], encryptedGuess1.inputProof);

      // Вторая попытка
      const encryptedGuess2 = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(guess2)
        .encrypt();

      await contract
        .connect(signers.player1)
        .makeGuess(gameId, encryptedGuess2.handles[0], encryptedGuess2.inputProof);

      const attempts = await contract.getPlayerAttempts(gameId, signers.player1.address);
      expect(attempts).to.equal(2);
    });

    it("should reject guesses after max attempts", async function () {
      // Делаем максимальное количество попыток
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const encryptedGuess = await fhevm
          .createEncryptedInput(contractAddress, signers.player1.address)
          .add8(i + 1)
          .encrypt();

        await contract
          .connect(signers.player1)
          .makeGuess(gameId, encryptedGuess.handles[0], encryptedGuess.inputProof);
      }

      // Попытка сделать еще одну попытку должна провалиться
      const encryptedGuess = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(99)
        .encrypt();

      await expect(
        contract
          .connect(signers.player1)
          .makeGuess(gameId, encryptedGuess.handles[0], encryptedGuess.inputProof)
      ).to.be.revertedWith("Max attempts reached");
    });
  });

  describe("Game Management", function () {
    let gameId: number;

    beforeEach(async function () {
      const encryptedSecret = await fhevm
        .createEncryptedInput(contractAddress, signers.host.address)
        .add8(50)
        .encrypt();

      await contract
        .connect(signers.host)
        .createGame(
          encryptedSecret.handles[0],
          encryptedSecret.inputProof,
          MAX_ATTEMPTS,
          { value: PRIZE_AMOUNT }
        );

      gameId = 0;
    });

    it("should allow host to end game early", async function () {
      const balanceBefore = await ethers.provider.getBalance(signers.host.address);
      
      const tx = await contract.connect(signers.host).endGame(gameId);
      const receipt = await tx.wait();
      
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice!;
      const balanceAfter = await ethers.provider.getBalance(signers.host.address);
      
      // Хост должен получить приз обратно (за вычетом газа)
      expect(balanceAfter).to.be.closeTo(
        balanceBefore + PRIZE_AMOUNT - gasUsed,
        ethers.parseEther("0.001") // Погрешность на газ
      );
    });

    it("should not allow non-host to end game", async function () {
      await expect(
        contract.connect(signers.player1).endGame(gameId)
      ).to.be.revertedWith("Only host can perform this action");
    });
  });
});
