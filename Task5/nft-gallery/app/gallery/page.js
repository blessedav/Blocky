"use client";
import { useState, useEffect } from "react";
import { Network, Alchemy } from "alchemy-sdk";

const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || "ТВОЙ_API_KEY";
const COLLECTION_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0xТВОЙ_АДРЕС_КОНТРАКТА";

const settings = {
  apiKey: ALCHEMY_KEY,
  network: Network.ETH_SEPOLIA,
};
const alchemy = new Alchemy(settings);

function resolveImage(url) {
  if (!url) return "";
  if (typeof url !== "string") return "";
  if (url.startsWith("ipfs://")) return url.replace("ipfs://", "https://ipfs.io/ipfs/");
  return url;
}

export default function Gallery() {
  const [nfts, setNfts] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNFTs() {
      try {
        const data = await alchemy.nft.getNftsForContract(COLLECTION_ADDRESS);
        const items = data?.nfts || [];
        setNfts(items);
        setFiltered(items);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchNFTs();
  }, []);

  useEffect(() => {
    const s = search.toLowerCase();
    setFiltered(
      nfts.filter((nft) => {
        const meta = nft.rawMetadata || {};
        const name = (meta.name || nft.title || "").toString().toLowerCase();
        const studentAttr = (meta.attributes || []).find((a) => a.trait_type === "Student Name");
        const student = (studentAttr?.value || "").toString().toLowerCase();
        return name.includes(s) || student.includes(s);
      })
    );
  }, [search, nfts]);

  return (
    <div style={{ padding: 20 }}>
      <h1>Выпускники 2024</h1>
      <input
        type="text"
        placeholder="Поиск по имени..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: 10, width: "100%", marginBottom: 20 }}
      />

      {loading ? (
        <p>Загрузка сертификатов...</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
          {filtered.map((nft, i) => {
            const img =
              nft.media?.[0]?.gateway ||
              nft.tokenUri?.gateway ||
              resolveImage(nft.rawMetadata?.image) ||
              "";
            const title = nft.rawMetadata?.name || nft.title || `#${nft.tokenId?.tokenId || i}`;
            return (
              <div key={i} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
                {img ? <img src={img} alt={title} style={{ width: "100%", borderRadius: 6 }} /> : <div style={{ height: 120, background: "#f3f3f3", borderRadius: 6 }} />}
                <h3>{title}</h3>
                <div style={{ fontSize: 14, color: "#555" }}>
                  {nft.rawMetadata?.attributes?.map((attr, idx) => (
                    <p key={idx}><strong>{attr.trait_type}:</strong> {String(attr.value)}</p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}