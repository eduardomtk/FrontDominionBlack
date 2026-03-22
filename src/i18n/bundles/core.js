// src/i18n/bundles/core.js
import { mergeLocaleBundles } from "./_locales26";

import { commonBundle } from "./common";
import { registerBundle } from "./register";
import { loginBundle } from "./login";
import { landingBundle } from "./landing";
import { headerBundle } from "./header";
import { sidebarBundle } from "./sidebar";
import { tradeBundle } from "./trade";
import { walletBundle } from "./wallet";
import { profileBundle } from "./profile";
import { profilePanelBundle } from "./profilePanel";
import { chartFooterBarBundle } from "./chartFooterBar";
import { bottomStatusBarBundle } from "./bottomStatusBar";
import { tradeHistoryBundle } from "./tradeHistory";
import { forgotPasswordBundle } from "./forgotPassword";
import { resetPasswordBundle } from "./resetPassword";
import { timeframePanelBundle } from "./timeframePanel";
import { pairSelectorPanelBundle } from "./pairSelectorPanel";
import { indicatorsPanelBundle } from "./indicatorsPanel";
import { drawingToolsPanelBundle } from "./drawingToolsPanel";
import { chartTypePanelBundle } from "./chartTypePanel";
import { activeTradesPanelBundle } from "./activeTradesPanel";
import { chartWorkspaceBundle } from "./chartWorkspace";
import { indicatorSettingsModalBundle } from "./indicatorSettingsModal";
import { drawingQuickToolbarBundle } from "./drawingQuickToolbar";
import { indicatorsBundle } from "./indicators"; // ✅ NOVO

export const coreBundle = mergeLocaleBundles(
  commonBundle,
  registerBundle,
  loginBundle,
  landingBundle,
  headerBundle,
  sidebarBundle,
  tradeBundle,
  walletBundle,
  profileBundle,
  profilePanelBundle,
  chartFooterBarBundle,
  bottomStatusBarBundle,
  tradeHistoryBundle,
  forgotPasswordBundle,
  resetPasswordBundle,
  timeframePanelBundle,
  pairSelectorPanelBundle,
  indicatorsPanelBundle,
  drawingToolsPanelBundle,
  chartTypePanelBundle,
  activeTradesPanelBundle,
  chartWorkspaceBundle,
  indicatorSettingsModalBundle,
  drawingQuickToolbarBundle,
  indicatorsBundle // ✅ NOVO
);