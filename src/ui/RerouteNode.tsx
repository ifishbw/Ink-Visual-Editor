import { Handle, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { SIDES, SIDE_POSITION, rerouteHandle, type RerouteFlowNode } from './flow';

/**
 * A draggable dot an edge passes through. Purely visual; lives in the sidecar, never in ink.
 *
 * All eight handles sit on top of each other at the centre of the dot, so only the side they declare matters:
 * `toFlow` picks the pair that faces the previous and next hop. That keeps a wire that doubles back running
 * straight through the dot instead of looping around a fixed left-in / right-out pair.
 */
export const RerouteNode = memo(function RerouteNode({ selected }: NodeProps<RerouteFlowNode>) {
  return (
    <div className={`reroute ${selected ? 'selected' : ''}`} title="Reroute point (drag to move, Delete to remove)">
      {SIDES.map((side) => (
        <Handle key={`in-${side}`} type="target" id={rerouteHandle('in', side)} position={SIDE_POSITION[side]} isConnectable={false} />
      ))}
      {SIDES.map((side) => (
        <Handle key={`out-${side}`} type="source" id={rerouteHandle('out', side)} position={SIDE_POSITION[side]} isConnectable={false} />
      ))}
    </div>
  );
});
