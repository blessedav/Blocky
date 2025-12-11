// app.js — полностью рабочая версия

let userScore = 0;
let computerScore = 0;

// DOM элементы
const userScore_span = document.getElementById('user-score');
const computerScore_span = document.getElementById('computer-score');
const result_p = document.querySelector('.result > p');

const rock_div = document.getElementById('r');
const paper_div = document.getElementById('p');
const scissors_div = document.getElementById('s');

const connectBtn = document.getElementById("connectBtn");

// Контракт — адрес и ABI (оставь свой ABI)
const contractAddress = "0xE8Db106a45D817Bf7a9d67A98909AF457371d4A1";
const contractABI = [
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "player",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "enum RPS.Move",
				"name": "playerMove",
				"type": "uint8"
			},
			{
				"indexed": false,
				"internalType": "enum RPS.Move",
				"name": "computerMove",
				"type": "uint8"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "result",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amountWon",
				"type": "uint256"
			}
		],
		"name": "GameResult",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "enum RPS.Move",
				"name": "_playerMove",
				"type": "uint8"
			}
		],
		"name": "play",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "withdraw",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getBalance",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "minBet",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

// Ethers объекты
let provider;
let signer;
let contract;

// Подключение кошелька
async function connectWallet() {
  try {
    if (!window.ethereum) {
      alert("MetaMask not found! Install or open MetaMask.");
      return;
    }
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    contract = new ethers.Contract(contractAddress, contractABI, signer);

    connectBtn.innerText = "Connected";
    connectBtn.disabled = true;
    console.log("Connected:", await signer.getAddress());
  } catch (err) {
    console.error("connectWallet error:", err);
    alert("Failed to connect wallet. See console.");
  }
}

// Хелперы
function toNumber(choice) {
  if (choice === 'r') return 0;
  if (choice === 'p') return 1;
  return 2;
}
function convertToWord(letter) {
  if (letter === 'r') return "Rock";
  if (letter === 'p') return "Paper";
  return "Scissors";
}
function showResult(text) {
  result_p.innerText = text;
}

// Основная функция игры
async function game(userChoice) {
  if (!contract || !provider || !signer) {
    alert("Connect wallet first!");
    return;
  }

  // UI
  showResult("Preparing transaction...");

  try {
    // ставку лучше брать из minBet, но здесь фиксируем 0.0001 — можно заменить
    const betValue = ethers.utils.parseEther("0.0001");

    // 1) minBet от контракта
    const minBet = await contract.minBet();
    console.log("minBet:", ethers.utils.formatEther(minBet));
    if (betValue.lt(minBet)) {
      showResult(`Minimum bet is ${ethers.utils.formatEther(minBet)} BNB`);
      return;
    }

    // 2) проверка баланса игрока
    const playerAddress = await signer.getAddress();
    const playerBalance = await provider.getBalance(playerAddress);
    console.log("playerBalance:", ethers.utils.formatEther(playerBalance));
    if (playerBalance.lt(betValue)) {
      showResult("Insufficient player balance for this bet.");
      return;
    }

    // 3) проверка баланса контракта (чтобы контракт мог выплатить при выигрыше)
    // контракт должен иметь >= betValue * 2 чтобы выплатить выигрыш
    let contractBalance = ethers.BigNumber.from(0);
    try {
      contractBalance = await contract.getBalance();
      console.log("contractBalance:", ethers.utils.formatEther(contractBalance));
    } catch (e) {
      console.warn("Could not read contract balance (getBalance may not exist).", e);
    }
    // если получили баланс и он меньше чем потенциальная выплата — предупреждаем
    if (contractBalance && contractBalance.gt(0)) {
      const needed = betValue.mul(2);
      if (contractBalance.lt(needed)) {
        showResult("Contract has low balance — it may not pay out wins. Try later.");
        // не return — можно всё равно проиграть/ничья, но предупреждаем. Если хочешь — return;
      }
    }

    // 4) Отправляем транзакцию с разумным gasLimit
    showResult("Sending transaction (confirm in MetaMask)...");
    const tx = await contract.play(toNumber(userChoice), {
      value: betValue,
      gasLimit: 200000 // увеличенный лимит — поможет избежать ошибок gas
    });

    showResult("Waiting for transaction to be mined...");
    const receipt = await tx.wait();
    console.log("Tx receipt:", receipt);

    // 5) Парсим событие GameResult из receipt.events
    if (!receipt || !receipt.events) {
      showResult("No receipt events found — transaction mined but no logs.");
      return;
    }

    // Найдём первое событие GameResult (имя берётся из ABI)
    const gameEvent = receipt.events.find(e => {
      // некоторые провайдеры попадают туда с parsed name, некоторые — нет.
      // Если e.event задан — сравниваем. Иначе проверяем topic[0] через сигнатуру.
      if (e.event) return e.event === "GameResult";
      return false;
    });

    if (!gameEvent) {
      // Попытка декодировать лог вручную (на случай, если provider не парсит event)
      // Но проще: показать пользователю, что события нет.
      showResult("GameResult event not found in receipt. Check contract logs.");
      console.warn("Receipt.events:", receipt.events);
      return;
    }

    // event.args содержит параметры согласно ABI
    const args = gameEvent.args;
    // args: player, playerMove (uint8), computerMove (uint8), result (string), amountWon (uint256)
    const playerMove = args.playerMove; // BigNumber -> number
    const computerMove = args.computerMove;
    const resultStr = args.result; // string: "You win!" / "You lost..." / "Draw"
    const amountWon = args.amountWon;

    console.log("Game event args:", { playerMove: playerMove.toString(), computerMove: computerMove.toString(), resultStr, amountWon: amountWon.toString() });

    // приводим к буквам
    const map = ["r", "p", "s"];
    const uc = map[Number(playerMove)];
    const cc = map[Number(computerMove)];

    // сравниваем реальные строки из контракта
    if (resultStr === "You win!") {
      userScore++;
      const wonBNB = ethers.utils.formatEther(amountWon);
      showResult(`${convertToWord(uc)} beats ${convertToWord(cc)}. You win! (+${wonBNB} BNB)`);
    } else if (resultStr === "You lost...") {
      computerScore++;
      showResult(`${convertToWord(uc)} loses to ${convertToWord(cc)}. You lose...`);
    } else if (resultStr === "Draw") {
      showResult(`${convertToWord(uc)} equals ${convertToWord(cc)}. It's a draw.`);
    } else {
      // непредвиденная строка — показываем её
      showResult(`Result: ${resultStr}`);
    }

    userScore_span.innerText = userScore;
    computerScore_span.innerText = computerScore;

  } catch (error) {
    console.error("Game error:", error);

    // Попытка получить человекочитаемое сообщение об ошибке
    let msg = "Transaction failed!";
    // ethers v5 содержит разные поля ошибок, пробуем извлечь
    if (error?.error?.message) {
      msg = error.error.message;
    } else if (error?.data?.message) {
      msg = error.data.message;
    } else if (error?.message) {
      msg = error.message;
    }

    // Укороченное, понятное сообщение
    showResult(`Transaction failed: ${msg}`);
  }
}

// Event listeners
connectBtn.addEventListener("click", connectWallet);
rock_div.addEventListener('click', () => game('r'));
paper_div.addEventListener('click', () => game('p'));
scissors_div.addEventListener('click', () => game('s'));