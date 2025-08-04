import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

task("create-game", "Create a new encrypted guess game")
  .addParam("secret", "The secret number (1-100)")
  .addParam("attempts", "Maximum attempts per player", "10")
  .addParam("prize", "Prize amount in ETH", "0.1")
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers, fhevm } = hre;
    const [signer] = await ethers.getSigners();
    
    const contract = await ethers.getContract("EncryptedGuessGame");
    const contractAddress = await contract.getAddress();
    
    console.log("Creating game with secret number:", taskArgs.secret);
    
    // Шифруем секретное число
    const encryptedSecret = await fhevm
      .createEncryptedInput(contractAddress, signer.address)
      .add8(parseInt(taskArgs.secret))
      .encrypt();
    
    const tx = await contract.createGame(
      encryptedSecret.handles[0],
      encryptedSecret.inputProof,
      parseInt(taskArgs.attempts),
      { value: ethers.parseEther(taskArgs.prize) }
    );
    
    const receipt = await tx.wait();
    console.log("Game created! Transaction:", receipt?.hash);
  });

task("make-guess", "Make a guess in an encrypted game")
  .addParam("gameid", "Game ID")
  .addParam("guess", "Your guess (1-100)")
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers, fhevm } = hre;
    const [signer] = await ethers.getSigners();
    
    const contract = await ethers.getContract("EncryptedGuessGame");
    const contractAddress = await contract.getAddress();
    
    console.log(`Making guess ${taskArgs.guess} for game ${taskArgs.gameid}`);
    
    // Шифруем догадку
    const encryptedGuess = await fhevm
      .createEncryptedInput(contractAddress, signer.address)
      .add8(parseInt(taskArgs.guess))
      .encrypt();
    
    const resultHandle = await contract.makeGuess(
      parseInt(taskArgs.gameid),
      encryptedGuess.handles[0],
      encryptedGuess.inputProof
    );
    
    console.log("Guess submitted! Decrypting result...");
    
    // Дешифруем результат
    const result = await fhevm.userDecryptEuint(
      hre.fhevm.FhevmType.euint8,
      resultHandle,
      contractAddress,
      signer
    );
    
    const resultText = {
      0: "🎉 Правильно! Вы угадали!",
      1: "📉 Ваше число меньше загаданного",
      2: "📈 Ваше число больше загаданного"
    }[result] || "Неизвестный результат";
    
    console.log("Результат:", resultText);
  });

task("game-info", "Get information about a game")
  .addParam("gameid", "Game ID")
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers } = hre;
    const contract = await ethers.getContract("EncryptedGuessGame");
    
    const gameInfo = await contract.getGameInfo(parseInt(taskArgs.gameid));
    
    console.log("Game Information:");
    console.log("- Host:", gameInfo.host);
    console.log("- Start Time:", new Date(Number(gameInfo.startTime) * 1000));
    console.log("- Max Attempts:", gameInfo.maxAttempts.toString());
    console.log("- State:", gameInfo.state);
    console.log("- Winner:", gameInfo.winner);
    console.log("- Prize:", ethers.formatEther(gameInfo.prize), "ETH");
  });
