// src/context/IndicatorsContext.jsx
import React, { createContext, useContext, useMemo, useReducer } from "react";
import { getIndicatorDefinition } from "@/indicators/indicatorRegistry";

const IndicatorsContext = createContext(null);

let instanceCounter = 1;

function bumpInstanceCounterFromInstances(instances) {
  // Evita colisão após F5 (counter volta p/ 1 no reload)
  const list = Array.isArray(instances) ? instances : [];
  let maxN = 0;

  for (const it of list) {
    const id = String(it?.instanceId || "");
    // pega sufixo após último "_"
    const idx = id.lastIndexOf("_");
    if (idx === -1) continue;
    const n = Number(id.slice(idx + 1));
    if (Number.isFinite(n)) maxN = Math.max(maxN, n);
  }

  instanceCounter = Math.max(instanceCounter, maxN + 1);
}

function createInstance(defId) {
  const def = getIndicatorDefinition(defId);
  if (!def) return null;

  const settings = {};
  for (const p of def.params || []) {
    settings[p.key] = p.default;
  }

  return {
    instanceId: `${defId}_${instanceCounter++}`,
    typeId: def.id,
    name: def.name,
    placement: def.placement,
    settings,
    visible: true,
  };
}

function hydrateInstancesFromPayload(payload) {
  const arr = Array.isArray(payload) ? payload : [];
  const out = [];

  for (const raw of arr) {
    const typeId = String(raw?.typeId || "").trim();
    if (!typeId) continue;

    const def = getIndicatorDefinition(typeId);
    if (!def) continue;

    const base = createInstance(def.id);
    if (!base) continue;

    const rawSettings = raw?.settings && typeof raw.settings === "object" ? raw.settings : {};

    const inst = {
      ...base,
      // preserva instanceId salvo (pra UI/edição ficar consistente)
      instanceId: typeof raw?.instanceId === "string" && raw.instanceId ? raw.instanceId : base.instanceId,
      // re-deriva do registry (fonte da verdade)
      typeId: def.id,
      name: def.name,
      placement: def.placement,
      // merge defaults + payload
      settings: { ...(base.settings || {}), ...(rawSettings || {}) },
      visible: raw?.visible !== false,
    };

    out.push(inst);
  }

  bumpInstanceCounterFromInstances(out);
  return out;
}

function reducer(state, action) {
  switch (action.type) {
    case "ADD_INDICATOR": {
      const def = getIndicatorDefinition(action.payload.typeId);
      if (!def) return state;

      const currentOfType = state.instances.filter((i) => i.typeId === def.id).length;

      if (typeof def.maxInstances === "number" && currentOfType >= def.maxInstances) {
        return state;
      }

      const instance = createInstance(def.id);
      if (!instance) return state;

      return {
        ...state,
        instances: [...state.instances, instance],
      };
    }

    case "REMOVE_INDICATOR": {
      const id = action.payload.instanceId;
      return {
        ...state,
        instances: state.instances.filter((i) => i.instanceId !== id),
      };
    }

    case "REMOVE_INDICATORS_BY_TYPE": {
      const { typeId } = action.payload;
      return {
        ...state,
        instances: state.instances.filter((i) => i.typeId !== typeId),
      };
    }

    case "UPDATE_INDICATOR_SETTINGS": {
      const { instanceId, settings } = action.payload;
      return {
        ...state,
        instances: state.instances.map((i) =>
          i.instanceId === instanceId ? { ...i, settings: { ...i.settings, ...settings } } : i
        ),
      };
    }

    case "TOGGLE_INDICATOR_VISIBILITY": {
      const { instanceId } = action.payload;
      return {
        ...state,
        instances: state.instances.map((i) =>
          i.instanceId === instanceId ? { ...i, visible: !i.visible } : i
        ),
      };
    }

    // ✅ Persistência
    case "SET_ALL_INSTANCES": {
      const hydrated = hydrateInstancesFromPayload(action.payload.instances);
      return { ...state, instances: hydrated };
    }

    case "CLEAR_ALL_INSTANCES": {
      return { ...state, instances: [] };
    }

    default:
      return state;
  }
}

const initialState = {
  instances: [],
};

export function IndicatorsProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const value = useMemo(
    () => ({
      instances: state.instances,

      addIndicator: (typeId) => dispatch({ type: "ADD_INDICATOR", payload: { typeId } }),

      removeIndicator: (instanceId) =>
        dispatch({ type: "REMOVE_INDICATOR", payload: { instanceId } }),

      removeIndicatorsByType: (typeId) =>
        dispatch({ type: "REMOVE_INDICATORS_BY_TYPE", payload: { typeId } }),

      updateIndicatorSettings: (instanceId, settings) =>
        dispatch({
          type: "UPDATE_INDICATOR_SETTINGS",
          payload: { instanceId, settings },
        }),

      toggleIndicatorVisibility: (instanceId) =>
        dispatch({
          type: "TOGGLE_INDICATOR_VISIBILITY",
          payload: { instanceId },
        }),

      // ✅ usados pela persistência (mínimo e direto)
      setAllInstances: (instances) =>
        dispatch({ type: "SET_ALL_INSTANCES", payload: { instances } }),

      clearAllIndicators: () => dispatch({ type: "CLEAR_ALL_INSTANCES" }),
    }),
    [state]
  );

  return <IndicatorsContext.Provider value={value}>{children}</IndicatorsContext.Provider>;
}

export function useIndicators() {
  const ctx = useContext(IndicatorsContext);
  if (!ctx) {
    throw new Error("useIndicators deve ser usado dentro de IndicatorsProvider");
  }
  return ctx;
}