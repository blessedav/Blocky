// Полностью переписанный app.js — vanilla JS, multi-account, history, nicer UI.
// Улучшена поддержка нескольких адресов: сохранение выбранного адреса, показ баланса рядом с аккаунтом,
// отслеживание accountsChanged/chainChanged, аккуратное наполнение селекта.

const contractAddress = "0x5353E51A8176337BEB0246ea849e96ad8aCb56Ae";
const contractABI = [
    {
        "inputs": [],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "anonymous": false,
        "inputs": [
            {"indexed": true,"internalType": "address","name": "player","type": "address"},
            {"indexed": false,"internalType": "enum RPS.Move","name": "playerMove","type": "uint8"},
            {"indexed": false,"internalType": "enum RPS.Move","name": "computerMove","type": "uint8"},
            {"indexed": false,"internalType": "string","name": "result","type": "string"},
            {"indexed": false,"internalType": "uint256","name": "amountWon","type": "uint256"}
        ],
        "name": "GameResult",
        "type": "event"
    },
    {"inputs":[{"internalType":"enum RPS.Move","name":"_playerMove","type":"uint8"}],"name":"play","outputs":[],"stateMutability":"payable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"getBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"minBet","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}
];

let provider, signer, contract;
let selectedAccount = null;
const SELECTED_KEY = 'rps_selected_account';

// DOM
const connectBtn = document.getElementById("connectBtn");
const accountSelect = document.getElementById("accountSelect");
const walletAddressText = document.getElementById("walletAddress");
const walletBalanceText = document.getElementById("walletBalance");
const result_p = document.getElementById("resultText");
const rockBtn = document.getElementById("r");
const paperBtn = document.getElementById("p");
const scissorsBtn = document.getElementById("s");
const userScore_span = document.getElementById('user-score');
const computerScore_span = document.getElementById('computer-score');
const historyDiv = document.getElementById('history');
const loadMoreBtn = document.getElementById('loadMore');
const minBetSpan = document.getElementById('minBet');
const contractBalanceSpan = document.getElementById('contractBalance');
const contractAddrSpan = document.getElementById('contractAddr');

contractAddrSpan.innerText = contractAddress;

// helpers
const FORMAT_MOVE = {0: "Rock", 1: "Paper", 2: "Scissors"};
function choiceToNum(c){ if(c==='r') return 0; if(c==='p') return 1; return 2; }
function shortAddr(a){ return a ? a.slice(0,6) + '...' + a.slice(-4) : ''; }
function saveHistoryFor(addr, list){
    try { localStorage.setItem(`rps_history_${addr.toLowerCase()}`, JSON.stringify(list)); } catch(e){}
}
function loadHistoryFor(addr){
    try { const s = localStorage.getItem(`rps_history_${addr.toLowerCase()}`); return s ? JSON.parse(s) : []; } catch(e){ return []; }
}
function prependHistoryEntry(entry){
    // entry: {txHash, blockNumber, time, playerMove, computerMove, result, amountWon}
    const div = document.createElement('div');
    div.className = 'entry';
    const time = entry.time ? new Date(entry.time*1000).toLocaleString() : `block ${entry.blockNumber}`;
    div.innerHTML = `<strong>${FORMAT_MOVE[entry.playerMove]} → ${FORMAT_MOVE[entry.computerMove]} — ${entry.result}</strong>
                     <div class="muted">${time} • ${entry.txHash ? entry.txHash.slice(0,10)+'...' : ''} ${entry.amountWon? ' • +' + entry.amountWon + ' BNB' : ''}</div>`;
    // insert at top
    if (historyDiv.firstChild && historyDiv.firstChild.classList && historyDiv.firstChild.classList.contains('muted')) {
        historyDiv.innerHTML = '';
    }
    historyDiv.insertBefore(div, historyDiv.firstChild);
}

// UI state helpers
function setStatus(text){ result_p.innerText = text; }
function setChoicesEnabled(enabled){
    [rockBtn, paperBtn, scissorsBtn].forEach(b => b.disabled = !enabled);
}

// populate account select with balances
async function populateAccounts(accounts){
    accountSelect.innerHTML = '';
    for (let a of accounts){
        const opt = document.createElement('option');
        opt.value = a;
        // fetch balance quickly (best-effort)
        let bal = '';
        try {
            const b = await provider.getBalance(a);
            bal = ethers.utils.formatEther(b);
            // round to 4 decimals
            bal = Number(bal) >= 0 ? Number(bal).toFixed(4) : bal;
        } catch(e){}
        opt.innerText = `${shortAddr(a)} ${bal? `(${bal} BNB)` : ''}`;
        accountSelect.appendChild(opt);
    }
    // restore previously selected if exists
    const saved = localStorage.getItem(SELECTED_KEY);
    if (saved && accounts.includes(saved)) {
        selectedAccount = saved;
        accountSelect.value = saved;
    } else if (accounts.length) {
        // prefer first if no saved or saved removed
        selectedAccount = accounts[0];
        accountSelect.value = selectedAccount;
        localStorage.setItem(SELECTED_KEY, selectedAccount);
    }
    signer = provider.getSigner(selectedAccount);
    contract = new ethers.Contract(contractAddress, contractABI, signer);
    await updateAccountUI();
    await loadAndShowHistory(selectedAccount);
    subscribeContractEvents();
    await updateContractInfo();
}

// Connect wallet and fill accounts
async function connectWallet(){
    try {
        if (!window.ethereum) { alert("Install MetaMask"); return; }
        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        const accounts = await provider.send("eth_requestAccounts", []);
        if (!accounts || accounts.length === 0) { setStatus("No accounts"); return; }

        // populate select with balances and restore selection
        await populateAccounts(accounts);

        // show chain info
        const network = await provider.getNetwork();
        walletAddressText.innerText = `Connected (chain ${network.chainId})`;

        // subscribe to wallet-level events
        if (window.ethereum && window.ethereum.on) {
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);
        }
    } catch (err) {
        console.error(err);
        alert("Connect failed: " + (err.message || err));
    }
}

async function handleAccountsChanged(newAccounts){
    try {
        if (!provider) provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        // populate list and keep previous selection if present
        await populateAccounts(newAccounts);
        // if currently selected not in newAccounts, switch to first and persist
        if (!newAccounts.includes(selectedAccount)) {
            selectedAccount = newAccounts[0] || null;
            if (selectedAccount) localStorage.setItem(SELECTED_KEY, selectedAccount);
            signer = selectedAccount ? provider.getSigner(selectedAccount) : null;
            contract = selectedAccount ? new ethers.Contract(contractAddress, contractABI, signer) : null;
            await updateAccountUI();
            await loadAndShowHistory(selectedAccount);
        }
    } catch(e){ console.error("accountsChanged handler error:", e); }
}

function handleChainChanged(_chainId){
    // reload provider state / contract info
    try {
        // simple approach: refresh UI and contract info
        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        if (selectedAccount) signer = provider.getSigner(selectedAccount);
        contract = signer ? new ethers.Contract(contractAddress, contractABI, signer) : null;
        updateContractInfo();
        updateAccountUI();
    } catch(e){ console.error(e); }
}

async function updateAccountUI(){
    if (!provider || !selectedAccount) {
        walletAddressText.innerText = 'Not connected';
        walletBalanceText.innerText = '';
        return;
    }
    try {
        const network = await provider.getNetwork();
        walletAddressText.innerText = `${shortAddr(selectedAccount)} (chain ${network.chainId})`;
        const bal = await provider.getBalance(selectedAccount);
        walletBalanceText.innerText = `Balance: ${Number(ethers.utils.formatEther(bal)).toFixed(4)} BNB`;
    } catch (e) { walletBalanceText.innerText = ''; }
}

// switching account from select
accountSelect.onchange = async (e) => {
    const addr = accountSelect.value;
    if (!addr) return;
    selectedAccount = addr;
    localStorage.setItem(SELECTED_KEY, selectedAccount);
    signer = provider.getSigner(selectedAccount);
    contract = new ethers.Contract(contractAddress, contractABI, signer);
    await updateAccountUI();
    await loadAndShowHistory(selectedAccount);
};

// load & display history (local + contract logs filtered to player)
async function loadAndShowHistory(addr){
    if (!addr) return;
    historyDiv.innerHTML = '<p class="muted">Loading history...</p>';
    // first local
    const local = loadHistoryFor(addr) || [];

    // try to query past events (limited to recent blocks to avoid huge queries)
    let merged = [...local];
    try {
        const filter = contract.filters.GameResult(addr);
        // query last 10000 blocks — adjust as needed
        const fromBlock = Math.max(0, (await provider.getBlockNumber()) - 10000);
        const logs = await contract.queryFilter(filter, fromBlock, "latest");
        // transform logs to entries and merge avoiding duplicates by txHash
        const map = new Map(merged.map(e => [e.txHash, e]));
        for (let lg of logs.reverse()){
            const args = lg.args;
            const txHash = lg.transactionHash;
            if (map.has(txHash)) continue;
            let block = await provider.getBlock(lg.blockNumber);
            const entry = {
                txHash,
                blockNumber: lg.blockNumber,
                time: block ? block.timestamp : undefined,
                playerMove: Number(args.playerMove),
                computerMove: Number(args.computerMove),
                result: String(args.result),
                amountWon: args.amountWon && !args.amountWon.isZero() ? ethers.utils.formatEther(args.amountWon) : undefined
            };
            merged.unshift(entry);
        }
        // cap to recent 200
        merged = merged.slice(0,200);
        saveHistoryFor(addr, merged);
    } catch (e) {
        console.warn("History query failed:", e);
    }

    // render
    historyDiv.innerHTML = '';
    if (!merged || merged.length === 0) {
        historyDiv.innerHTML = '<p class="muted">No games yet.</p>';
        return;
    }
    merged.forEach(e => prependHistoryEntry(e));
}

// subscribe to live events (adds only)
function subscribeContractEvents(){
    if (!contract) return;
    // remove previous listeners
    try { contract.removeAllListeners("GameResult"); } catch(e){}
    contract.on("GameResult", async (player, playerMove, computerMove, result, amountWon, event) => {
        try {
            const playerAddr = player.toLowerCase();
            const me = selectedAccount ? selectedAccount.toLowerCase() : null;
            const entry = {
                txHash: event.transactionHash,
                blockNumber: event.blockNumber,
                time: (await provider.getBlock(event.blockNumber)).timestamp,
                playerMove: Number(playerMove),
                computerMove: Number(computerMove),
                result: String(result),
                amountWon: amountWon && !amountWon.isZero() ? ethers.utils.formatEther(amountWon) : undefined
            };
            // append to local storage for the player
            const hist = loadHistoryFor(playerAddr) || [];
            hist.unshift(entry);
            saveHistoryFor(playerAddr, hist.slice(0,500));
            // if this event is for currently selected account - show it
            if (me && playerAddr === me) {
                prependHistoryEntry(entry);
                // update scores quickly based on result
                if (entry.result === "You win!") {
                    userScore_span.innerText = String(Number(userScore_span.innerText) + 1);
                } else if (entry.result === "You lost...") {
                    computerScore_span.innerText = String(Number(computerScore_span.innerText) + 1);
                }
            }
        } catch (e){ console.error("on event error:", e); }
    });
}

// refresh contract info like minBet and contract balance
async function updateContractInfo(){
    try {
        const minBet = await contract.minBet();
        minBetSpan.innerText = `${ethers.utils.formatEther(minBet)} BNB`;
    } catch(e){ minBetSpan.innerText = '—'; }
    try {
        const cb = await contract.getBalance();
        contractBalanceSpan.innerText = `${ethers.utils.formatEther(cb)} BNB`;
    } catch(e){ contractBalanceSpan.innerText = '—'; }
}

// Core play function (unchanged logic)
async function play(moveChar){
    if (!contract || !provider || !signer) { alert("Connect wallet"); return; }
    setChoicesEnabled(false);
    setStatus("Preparing transaction...");
    const amount = ethers.utils.parseEther("0.0001"); // fixed; could read minBet
    const choiceNum = choiceToNum(moveChar);

    try {
        // callStatic to capture revert reason
        try {
            await contract.callStatic.play(choiceNum, { value: amount });
        } catch (callErr){
            // extract revert reason
            let reason = null;
            if (callErr.error && callErr.error.data) {
                // try decode solidity revert
                try {
                    reason = ethers.utils.toUtf8String("0x" + callErr.error.data.slice(138));
                } catch(e){}
            }
            setStatus("Reverted: " + (reason || (callErr.message || "Unknown")));
            setChoicesEnabled(true);
            return;
        }

        setStatus("Sending transaction — confirm in wallet...");
        const tx = await contract.play(choiceNum, { value: amount, gasLimit: 200000 });
        setStatus(`Tx sent ${tx.hash.slice(0,10)}... Waiting for confirmation...`);
        const receipt = await tx.wait();
        if (receipt.status === 0) {
            setStatus("Transaction mined but failed (status 0).");
            setChoicesEnabled(true);
            return;
        }

        // parse event in receipt
        const gameEvent = receipt.events && receipt.events.find(e => e.event === "GameResult");
        if (!gameEvent) {
            setStatus("Transaction mined but GameResult not found.");
            setChoicesEnabled(true);
            return;
        }
        const args = gameEvent.args;
        const playerMove = Number(args.playerMove);
        const computerMove = Number(args.computerMove);
        const resultStr = String(args.result);
        const amountWon = args.amountWon && !args.amountWon.isZero() ? ethers.utils.formatEther(args.amountWon) : null;

        // update UI
        if (resultStr === "You win!") {
            userScore_span.innerText = String(Number(userScore_span.innerText) + 1);
            setStatus(`${FORMAT_MOVE[playerMove]} beats ${FORMAT_MOVE[computerMove]}. You win! ${amountWon ? '(+'+amountWon+' BNB)' : ''}`);
        } else if (resultStr === "You lost...") {
            computerScore_span.innerText = String(Number(computerScore_span.innerText) + 1);
            setStatus(`${FORMAT_MOVE[playerMove]} loses to ${FORMAT_MOVE[computerMove]}. You lose...`);
        } else {
            setStatus(`${FORMAT_MOVE[playerMove]} equals ${FORMAT_MOVE[computerMove]}. Draw.`);
        }

        // add to history
        const block = await provider.getBlock(receipt.blockNumber);
        const entry = {
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            time: block ? block.timestamp : undefined,
            playerMove,
            computerMove,
            result: resultStr,
            amountWon
        };
        const hist = loadHistoryFor(selectedAccount) || [];
        hist.unshift(entry);
        saveHistoryFor(selectedAccount, hist.slice(0,500));
        prependHistoryEntry(entry);

        await updateContractInfo();

    } catch (err) {
        console.error("Play error:", err);
        let msg = err?.message || String(err);
        setStatus("Transaction failed: " + msg);
    } finally {
        setChoicesEnabled(true);
    }
}

// wire UI
connectBtn.addEventListener("click", connectWallet);
rockBtn.addEventListener("click", () => play('r'));
paperBtn.addEventListener("click", () => play('p'));
scissorsBtn.addEventListener("click", () => play('s'));
loadMoreBtn.addEventListener("click", async () => {
    if (selectedAccount) await loadAndShowHistory(selectedAccount);
});

// on load: check if injected accounts already available
document.addEventListener('DOMContentLoaded', async () => {
    if (window.ethereum && provider === undefined) {
        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        try {
            const accounts = await provider.listAccounts();
            if (accounts && accounts.length) {
                await populateAccounts(accounts);
            }
        } catch (e){}
    }
});