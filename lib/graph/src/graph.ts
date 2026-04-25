import { InputPort, OutputPort } from '@lights/io';
import { BaseDriver } from '@lights/driver';
import { BaseModule } from '@lights/module';

/**
 * Directed acyclic graph of drivers and modules.
 * Nodes are registered by ID; edges are declared as "nodeId:portName" string pairs.
 * Wiring and startup happen lazily on start().
 */
export class Graph {
  private drivers = new Map<NodeId, BaseDriver>();
  private modules = new Map<NodeId, BaseModule>();
  private edges: Array<{ from: string; to: string }> = [];

  /**
   * Registers a driver node.
   * @param {string} id - Unique node identifier
   * @param {BaseDriver} driver - The driver instance
   */
  addDriver(id: NodeId, driver: BaseDriver): this {
    if (this.hasNode(id)) throw new Error(`Node "${id}" already exists`);
    this.drivers.set(id, driver);
    return this;
  }

  /**
   * Registers a module node.
   * @param {string} id - Unique node identifier
   * @param {BaseModule} module - The module instance
   */
  addModule(id: NodeId, module: BaseModule): this {
    if (this.hasNode(id)) throw new Error(`Node "${id}" already exists`);
    this.modules.set(id, module);
    return this;
  }

  /**
   * Declares an edge between two ports.
   * @param {string} from - Source port reference as "nodeId:portName"
   * @param {string} to - Target port reference as "nodeId:portName"
   */
  connect(from: string, to: string): this {
    this.edges.push({ from, to });
    return this;
  }

  /**
   * Validates the topology, wires all ports, then starts every node.
   */
  start(): void {
    for (const { from, to } of this.edges) {
      const fromRef = parsePortRef(from);
      const toRef = parsePortRef(to);

      const fromNode =
        this.drivers.get(fromRef.nodeId) ?? this.modules.get(fromRef.nodeId);
      if (!fromNode) throw new Error(`Node "${fromRef.nodeId}" not found`);

      const toNode = this.modules.get(toRef.nodeId);
      if (!toNode) throw new Error(`Node "${toRef.nodeId}" not found`);

      resolveInputPort(toNode, toRef.portName).connect(
        resolveOutputPort(fromNode, fromRef.portName).stream$,
      );
    }

    for (const driver of this.drivers.values()) driver.start();
    for (const module of this.modules.values()) module.start();
  }

  /**
   * Stops every node and disconnects all wired input ports.
   */
  stop(): void {
    for (const driver of this.drivers.values()) driver.stop();
    for (const module of this.modules.values()) module.stop();

    for (const { to } of this.edges) {
      const { nodeId, portName } = parsePortRef(to);
      const node = this.modules.get(nodeId);
      if (!node) continue;
      const port = (node as unknown as Record<string, unknown>)[portName];
      if (port instanceof InputPort) port.disconnect();
    }
  }

  private hasNode(id: NodeId): boolean {
    return this.drivers.has(id) || this.modules.has(id);
  }
}

type NodeId = string;

function parsePortRef(ref: string): { nodeId: NodeId; portName: string } {
  const colon = ref.indexOf(':');
  if (colon === -1)
    throw new Error(
      `Invalid port reference "${ref}", expected "nodeId:portName"`,
    );
  return { nodeId: ref.slice(0, colon), portName: ref.slice(colon + 1) };
}

function resolveOutputPort(
  node: BaseDriver | BaseModule,
  portName: string,
): OutputPort {
  const port = (node as unknown as Record<string, unknown>)[portName];
  if (!(port instanceof OutputPort))
    throw new Error(`Port "${portName}" is not an OutputPort`);
  return port;
}

function resolveInputPort(node: BaseModule, portName: string): InputPort {
  const port = (node as unknown as Record<string, unknown>)[portName];
  if (!(port instanceof InputPort))
    throw new Error(`Port "${portName}" is not an InputPort`);
  return port;
}