import { usePairUI } from "../../../context/PairUIContext";
import { AssetRegistry, ASSET_TYPES } from "../../../engine/AssetRegistry";
import PairCard from "./PairCard";

export default function PairDock() {
  const { isDockOpen, openedPairs, setActivePair } = usePairUI();

  if (!isDockOpen) return null;

  return (
    <div style={dockStyle}>
      {openedPairs.map((pair, index) => {
        const isForex = AssetRegistry.isForex(pair.symbol);

        return (
          <div
            key={pair.symbol}
            style={{
              ...cardWrapperStyle,
              left: index * 60,
              zIndex: 10 + index,
            }}
          >
            <PairCard
              symbol={pair.symbol}
              category={isForex ? ASSET_TYPES.FOREX : ASSET_TYPES.CRYPTO}
              payout={pair.payout}
              active={pair.active}
              onClick={() => setActivePair(pair.symbol)}
            />
          </div>
        );
      })}
    </div>
  );
}

const dockStyle = {
  position: "absolute",
  top: 12,
  left: 80,
  display: "flex",
  pointerEvents: "none",
};

const cardWrapperStyle = {
  position: "absolute",
  pointerEvents: "auto",
  transition: "transform 0.2s ease, z-index 0.2s ease",
};
