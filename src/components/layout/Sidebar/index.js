import React from "react";
import LeftSidebar from "./LeftSidebar";

// Sidebar agora é SOMENTE um wrapper
export default function Sidebar({ activePanel, setActivePanel }) {
  return (
    <LeftSidebar
      activePanel={activePanel}
      setActivePanel={setActivePanel}
    />
  );
}

// Export nomeado continua funcionando
export { default as Header } from "../Header/Header";
