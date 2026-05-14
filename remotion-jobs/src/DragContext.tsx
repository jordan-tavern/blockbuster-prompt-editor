import React, { createContext, useContext } from "react";
import type { DragCallbacks } from "./types";

const DragContext = createContext<DragCallbacks>({});

export const DragProvider = DragContext.Provider;

export function useDragCallbacks(): DragCallbacks {
  return useContext(DragContext);
}
