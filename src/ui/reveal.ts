/** Travelling to a knot: select it and fly the canvas there. Shared by the sidebar's search and the editor's links. */
import { useReactFlow } from '@xyflow/react';
import { useCallback } from 'react';

export function useReveal(): (id: string) => void {
  const rf = useReactFlow();
  return useCallback(
    (id: string) => {
      rf.setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
      void rf.fitView({ nodes: [{ id }], duration: 300, maxZoom: 1.1, padding: 0.4 });
    },
    [rf],
  );
}
