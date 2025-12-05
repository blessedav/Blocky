// Connecting to the contract
const contractAddress = "0x58134575Ae302d51650230E01EFF61Fe9372eB19"; // Replace it with your contract

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
    showErrorToPage("Transaction confirmed: " + tx.hash);
  } catch (err) {
    showErrorToPage("setNote error: " + (err && err.message ? err.message : err));
  }
}

async function getNote() {
  try {
    await ensureConnected();
    const note = await contract.getNote();
    console.log("Note from contract:", note);
    const resultEl = document.getElementById("result");
    if (resultEl) resultEl.innerText = note;
  } catch (err) {
    showErrorToPage("getNote error: " + (err && err.message ? err.message : err));
  }
}

// ensure functions are available on the window for onclick in HTML
window.setNote = setNote;
window.getNote = getNote;
