// Connecting to the contract
const contractAddress = "0x5802A4DE231aBD3131a9c4f03d077Eb60e8D79f0"; // Replace it with your contract

const abi = [
  {
    inputs: [
      {
        internalType: "string",
        name: "_note",
        type: "string",
      },
    ],
    name: "setNote",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getNote",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

let provider;
let signer;
let contract;

function showErrorToPage(msg) {
  console.error(msg);
  const resultEl = document.getElementById("result");
  if (resultEl) resultEl.innerText = String(msg);
}

async function ensureConnected() {
  try {
    if (location.protocol === "file:") {
      throw new Error("Serve this page via http(s). Run: python3 -m http.server 8000 in the project folder");
    }
    if (!window.ethereum) {
      throw new Error("window.ethereum not found — install and unlock MetaMask");
    }
    if (!provider) {
      provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    }
    // request accounts
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    contract = new ethers.Contract(contractAddress, abi, signer);
    const addr = await signer.getAddress();
    console.log("Connected. Account:", addr);
    return true;
  } catch (err) {
    showErrorToPage("Wallet connection error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

// Local-storage helpers to keep a client-side history of notes the user set
function _notesStorageKey() {
  return "notesHistory_v1";
}

function saveNoteLocally(note, txHash) {
  try {
    const key = _notesStorageKey();
    const arr = JSON.parse(localStorage.getItem(key) || "[]");
    arr.push({ note, txHash, time: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {
    console.warn("Failed to save note locally", e);
  }
}

function getLocalNotes() {
  try {
    return JSON.parse(localStorage.getItem(_notesStorageKey()) || "[]");
  } catch (e) {
    console.warn("Failed to read local notes", e);
    return [];
  }
}

async function setNote() {
  try {
    await ensureConnected();
    const noteInput = document.getElementById("note");
    const note = noteInput ? noteInput.value.trim() : "";
    if (!note) {
      showErrorToPage("Enter a non-empty note before sending.");
      return;
    }
    const tx = await contract.setNote(note);
    console.log("Transaction sent:", tx.hash);
    showErrorToPage("Transaction sent: " + tx.hash + " — waiting for confirmation...");
    await tx.wait();
    // Save the note locally after confirmation so you can retrieve past notes in the UI
    saveNoteLocally(note, tx.hash);
    showErrorToPage("Transaction confirmed: " + tx.hash);
  } catch (err) {
    showErrorToPage("setNote error: " + (err && err.message ? err.message : err));
  }
}

async function getNote() {
  try {
    await ensureConnected();

    // prefer a dedicated search input with id="query", fallback to the main note input
    const queryInput = document.getElementById("query") || document.getElementById("note");
    const query = queryInput ? queryInput.value.trim() : "";

    const resultEl = document.getElementById("result");
    if (!resultEl) return;

    if (!query) {
      resultEl.innerText = 'Enter the exact note text to search for (input id="note" or id="query").';
      return;
    }

    // read on-chain latest value and local history
    const onchainNote = String(await contract.getNote());
    const history = getLocalNotes();

    const qLower = query.toLowerCase();
    let out = `Searching for exact note: "${query}"\n\n`;

    // check exact (case-insensitive) equality with on-chain latest
    const onchainMatch = onchainNote.toLowerCase() === qLower;
    if (onchainMatch) {
      out += `FOUND on-chain (latest): ${onchainNote}\n\n`;
    }

    // find exact (case-insensitive) local matches regardless of order
    const matches = history.filter((entry) => String(entry.note).toLowerCase() === qLower);
    if (matches.length > 0) {
      out += `FOUND ${matches.length} match(es) in local history:\n`;
      matches.forEach((entry, idx) => {
        out += `${idx + 1}. [${entry.time}] ${entry.note} (tx: ${entry.txHash})\n`;
      });
      out += "\n";
    }

    if (!onchainMatch && matches.length === 0) {
      out += "No node like that.";
    }

    resultEl.innerText = out;
  } catch (err) {
    showErrorToPage("getNote error: " + (err && err.message ? err.message : err));
  }
}

// ensure functions are available on the window for onclick in HTML
window.setNote = setNote;
window.getNote = getNote;
