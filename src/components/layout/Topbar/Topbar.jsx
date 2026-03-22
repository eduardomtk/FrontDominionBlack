import React, { useState } from "react";
// O "../../.." sobe três níveis para sair de Topbar, layout e components e chegar no src
import { useBalance } from "../../../context/BalanceContext";

export default function Topbar() {
  const { balance } = useBalance() || { balance: 0 };
  const [isReal, setIsReal] = useState(true);

  return (
    <div style={barStyle}>
      {/* LOGO */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <strong style={{ color: "white", fontSize: "20px", marginLeft: "10px", letterSpacing: "-0.5px" }}>
          Trade<span style={{ color: "#00c076", textShadow: "0 0 10px rgba(0, 192, 118, 0.5)" }}>Pro</span>
        </strong>
      </div>

      <div style={rightSide}>
        {/* SELETOR DE CONTA ULTRA COMPACTO */}
        <div 
          style={accountPill}
          onClick={() => setIsReal(!isReal)}
        >
          <div style={pillLabelRow}>
            <span style={{ 
              width: "6px", height: "6px", borderRadius: "50%", 
              background: isReal ? "#00c076" : "#f2a100",
              boxShadow: isReal 
                ? "0 0 12px 2px rgba(0, 192, 118, 0.8), 0 0 4px rgba(0, 192, 118, 1)" 
                : "0 0 12px 2px rgba(242, 161, 0, 0.8), 0 0 4px rgba(242, 161, 0, 1)"
            }}></span>
            <span style={labelHighlight}>{isReal ? "CONTA REAL" : "CONTA DEMO"}</span>
          </div>

          <div style={valueAndArrowRow}>
            <span style={isReal ? greenText : orangeText}>
              R$ {balance?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            <span style={bigArrow}>▾</span>
          </div>
        </div>

        {/* BOTÕES COM EFEITO DE MOVIMENTO E NEON */}
        <div style={btnGroup}>
          <button 
            style={btnDeposit}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = "brightness(1.2)";
              e.currentTarget.style.boxShadow = "0 0 20px rgba(0, 192, 118, 0.7)";
              e.currentTarget.style.transform = "translateY(-3px) scale(1.05)"; // MOVE E AUMENTA
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "brightness(1)";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.transform = "translateY(0) scale(1)"; // VOLTA AO NORMAL
            }}
          >
            DEPÓSITO
          </button>

          <button 
            style={btnWithdraw}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = "brightness(1.2)";
              e.currentTarget.style.boxShadow = "0 0 20px rgba(37, 99, 235, 0.7)";
              e.currentTarget.style.transform = "translateY(-3px) scale(1.05)"; // MOVE E AUMENTA
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "brightness(1)";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.transform = "translateY(0) scale(1)"; // VOLTA AO NORMAL
            }}
          >
            SAQUE
          </button>
        </div>

        {/* PERFIL */}
        <div style={userSection}>
           <div style={userInfo}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#fff" }}>Trader VIP</span>
              <span style={{ fontSize: "9px", color: "#00c076", fontWeight: "bold" }}>Verificado</span>
           </div>
           <div style={avatarCircle}>
              <img src="https://ui-avatars.com/api/?name=Trader+Pro&background=1e293b&color=fff" alt="User" style={{ width: '100%', borderRadius: '50%' }} />
           </div>
        </div>
      </div>
    </div>
  );
}

// --- ESTILOS ---
const barStyle = { 
  width: "100%", height: "65px", background: "#0b121e", 
  display: "flex", justifyContent: "space-between", alignItems: "center", 
  padding: "0 20px", borderBottom: "1px solid #1e293b", boxSizing: "border-box"
};

const rightSide = { display: "flex", gap: "12px", alignItems: "center" };

const accountPill = { 
  background: "#161d2f", padding: "4px 8px", borderRadius: "6px", 
  border: "1px solid #334155", display: "flex", flexDirection: "column", 
  alignItems: "center", cursor: "pointer", transition: "all 0.2s ease", width: "fit-content", minWidth: "120px"
};

const pillLabelRow = { display: "flex", alignItems: "center", gap: "6px", justifyContent: "center", width: "100%", marginBottom: "1px" };
const valueAndArrowRow = { display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", width: "100%" };
const bigArrow = { fontSize: "20px", color: "#94a3b8", lineHeight: "0", display: "flex", alignItems: "center", marginTop: "2px" };
const labelHighlight = { fontSize: "8px", color: "#94a3b8", fontWeight: "900", letterSpacing: "0.2px" };
const greenText = { color: "#00c076", fontWeight: "800", fontSize: "16px" };
const orangeText = { color: "#f2a100", fontWeight: "800", fontSize: "16px" };

const btnGroup = { display: "flex", gap: "10px" };

const baseBtnStyle = {
  width: "105px", height: "38px", border: "none", borderRadius: "6px",
  fontWeight: "900", cursor: "pointer", fontSize: "12px", 
  display: "flex", justifyContent: "center", alignItems: "center",
  transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)" // Transição suave com "efeito mola"
};

const btnDeposit = { ...baseBtnStyle, background: "#00c076", color: "#000" };
const btnWithdraw = { ...baseBtnStyle, background: "#2563eb", color: "#fff" };

const userSection = { display: "flex", alignItems: "center", gap: "10px", paddingLeft: "12px", borderLeft: "1px solid #1e293b" };
const userInfo = { display: "flex", flexDirection: "column", alignItems: "flex-end" };
const avatarCircle = { width: "32px", height: "32px", borderRadius: "50%", border: "2px solid #1e293b", display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden" };
