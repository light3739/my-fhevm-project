import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  console.log("Deploying EncryptedGuessGame with account:", deployer);

  const deployedGame = await deploy("EncryptedGuessGame", {
    from: deployer,
    log: true,
    gasLimit: 3000000,
  });

  console.log(`EncryptedGuessGame deployed to: ${deployedGame.address}`);
  
  // Верификация контракта на Etherscan (если на testnet)
  if (hre.network.name === "sepolia") {
    console.log("Waiting for block confirmations...");
    await hre.deployments.get("EncryptedGuessGame");
    
    try {
      await hre.run("verify:verify", {
        address: deployedGame.address,
        constructorArguments: [],
      });
      console.log("Contract verified on Etherscan");
    } catch (error) {
      console.log("Verification failed:", error);
    }
  }
};

export default func;
func.id = "deploy_encryptedGuessGame";
func.tags = ["EncryptedGuessGame"];
