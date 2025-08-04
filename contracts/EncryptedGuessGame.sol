// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint8, externalEuint8, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EncryptedGuessGame is SepoliaConfig {
    enum GameState { NotStarted, Active, Ended }

    struct Game {
        address host;
        euint8 secretNumber;
        uint256 startTime;
        uint256 maxAttempts;
        GameState state;
        address winner;
        uint256 prize;
    }

    event GameCreated(uint256 indexed gameId, address indexed host, uint256 prize);
    // Событие можно оставить или убрать, не критично для тестов
    event GameEnded(uint256 indexed gameId);

    uint256 public gameCounter;
    mapping(uint256 => Game) public games;
    mapping(uint256 => mapping(address => uint256)) public playerAttempts;
    mapping(uint256 => mapping(address => euint8[])) public playerGuesses;

    uint256 public constant MIN_PRIZE = 0.01 ether;
    uint256 public constant MAX_GAME_DURATION = 24 hours;

    modifier onlyHost(uint256 gameId) {
        require(games[gameId].host == msg.sender, "Only host can perform this action");
        _;
    }
    modifier gameActive(uint256 gameId) {
        Game storage g = games[gameId];
        require(g.state == GameState.Active, "Game is not active");
        require(block.timestamp <= g.startTime + MAX_GAME_DURATION, "Game expired");
        _;
    }

    function createGame(
        externalEuint8 secretNumber,
        bytes calldata inputProof,
        uint256 maxAttempts
    )
        external
        payable
        returns (uint256 gameId)
    {
        require(msg.value >= MIN_PRIZE, "Prize too small");
        require(maxAttempts > 0 && maxAttempts <= 20, "Invalid max attempts");

        euint8 secretEnc = FHE.fromExternal(secretNumber, inputProof);

        gameId = gameCounter++;
        games[gameId] = Game({
            host: msg.sender,
            secretNumber: secretEnc,
            startTime: block.timestamp,
            maxAttempts: maxAttempts,
            state: GameState.Active,
            winner: address(0),
            prize: msg.value
        });

        FHE.allowThis(secretEnc);
        FHE.allow(secretEnc, msg.sender);

        emit GameCreated(gameId, msg.sender, msg.value);
    }

    /// @notice Сделать зашифрованную догадку
    /// @return result Зашифрованный результат (euint8)
    function makeGuess(
        uint256 gameId,
        externalEuint8 guess,
        bytes calldata inputProof
    )
        external
        gameActive(gameId)
        returns (euint8 result)
    {
        Game storage g = games[gameId];
        require(g.winner == address(0), "Game already won");
        require(playerAttempts[gameId][msg.sender] < g.maxAttempts, "Max attempts reached");

        euint8 guessEnc = FHE.fromExternal(guess, inputProof);
        playerGuesses[gameId][msg.sender].push(guessEnc);
        playerAttempts[gameId][msg.sender]++;

        ebool eq = FHE.eq(guessEnc, g.secretNumber);
        ebool lt = FHE.lt(guessEnc, g.secretNumber);
        result = FHE.select(
            eq,
            FHE.asEuint8(0),
            FHE.select(lt, FHE.asEuint8(1), FHE.asEuint8(2))
        );

        FHE.allowThis(result);
        FHE.allow(result, msg.sender);

        // Возвращаем euint8 прямо
    }

    function endGame(uint256 gameId) external onlyHost(gameId) {
        Game storage g = games[gameId];
        require(g.state == GameState.Active, "Game is not active");
        g.state = GameState.Ended;
        payable(g.host).transfer(g.prize);
        emit GameEnded(gameId);
    }

    function getPlayerAttempts(uint256 gameId, address player)
        external
        view
        returns (uint256 count)
    {
        count = playerAttempts[gameId][player];
    }

    function getPlayerGuesses(uint256 gameId, address player)
        external
        view
        returns (euint8[] memory guesses)
    {
        guesses = playerGuesses[gameId][player];
    }

    function getGameInfo(uint256 gameId)
        external
        view
        returns (
            address host,
            uint256 startTime,
            uint256 maxAttempts,
            GameState state,
            address winner,
            uint256 prize
        )
    {
        Game memory g = games[gameId];
        return (
            g.host,
            g.startTime,
            g.maxAttempts,
            g.state,
            g.winner,
            g.prize
        );
    }
}
