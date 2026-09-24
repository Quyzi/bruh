import { createContext, memo, useContext, useEffect, useState, type ChangeEvent } from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { fieldBlockHeight, minNodeHeight, nodeBodyMinHeight } from "../builtins";
import { getNodeDef } from "../catalog";
import type { FieldDef, FlowNodeData } from "../types";
import { loadComboOptions } from "./comboOptions";

export type BruhNode = Node<FlowNodeData, "bruh">;

export type NodeUpdate = (id: string, recipe: (data: FlowNodeData) => FlowNodeData) => void;

export const NodeEditContext = createContext<NodeUpdate>(() => {});
export const RunningContext = createContext<ReadonlySet<string>>(new Set());

const singleLineFieldStyle = { flexShrink: 0, minHeight: fieldBlockHeight("text") } as const;

function FlowNode({ id, data, selected }: NodeProps<BruhNode>) {
  const update = useContext(NodeEditContext);
  const running = useContext(RunningContext);
  const def = getNodeDef(data.liteType);
  const fields = def?.fields ?? [];
  const minHeight = minNodeHeight({ inputs: data.inputs, outputs: data.outputs, fields });
  const className = [
    "bruh-node",
    selected ? "bruh-node--selected" : "",
    running.has(id) ? "bruh-node--running" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} title={def?.description}>
      <NodeResizer
        isVisible={Boolean(selected)}
        minWidth={180}
        minHeight={minHeight}
        color="#646cff"
        lineStyle={{ borderColor: "#646cff" }}
      />
      <div className="bruh-node__title">{data.title}</div>
      <PortColumns data={data} />
      {fields.length > 0 && (
        <div
          className="bruh-node__body"
          style={{ overflow: "visible", flexShrink: 0, minHeight: nodeBodyMinHeight(fields) }}
        >
          {fields.map((field) => (
            <Field key={field.key} id={id} field={field} data={data} update={update} />
          ))}
        </div>
      )}
    </div>
  );
}

function PortColumns({ data }: { data: FlowNodeData }) {
  if (data.inputs.length === 0 && data.outputs.length === 0) return null;
  return (
    <div className="bruh-node__ports">
      <div className="bruh-node__col">
        {data.inputs.map((port, index) => (
          <div className="bruh-node__port" key={`in-${index}`}>
            <Handle type="target" position={Position.Left} id={`in-${index}`} />
            <span>{port.name}</span>
          </div>
        ))}
      </div>
      <div className="bruh-node__col bruh-node__col--out">
        {data.outputs.map((port, index) => (
          <div className="bruh-node__port" key={`out-${index}`}>
            <span>{port.name}</span>
            <Handle type="source" position={Position.Right} id={`out-${index}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({
  id,
  field,
  data,
  update,
}: {
  id: string;
  field: FieldDef;
  data: FlowNodeData;
  update: NodeUpdate;
}) {
  const value = data.properties[field.key];
  const text = value === undefined || value === null ? "" : String(value);
  const setValue = (next: string) => {
    update(id, (current) => ({
      ...current,
      properties: { ...current.properties, [field.key]: next },
    }));
  };

  if (field.kind === "combo" && field.options) {
    return (
      <ComboField
        id={id}
        field={field}
        source={field.options}
        value={text}
        autoPick={Boolean(data.autoPick)}
      />
    );
  }

  if (field.kind === "textarea") {
    return (
      <label className="bruh-node__field" style={{ minHeight: fieldBlockHeight(field.kind) }}>
        <span className="bruh-node__label">{field.label}</span>
        <textarea
          className="nodrag nopan nowheel nokey"
          rows={field.rows ?? 6}
          value={text}
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
    );
  }

  return (
    <label className="bruh-node__field bruh-node__field--text" style={singleLineFieldStyle}>
      <span className="bruh-node__label">{field.label}</span>
      <input
        className="nodrag nopan nowheel nokey"
        type="text"
        value={text}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  );
}

function ComboField({
  id,
  field,
  source,
  value,
  autoPick,
}: {
  id: string;
  field: FieldDef;
  source: NonNullable<FieldDef["options"]>;
  value: string;
  autoPick: boolean;
}) {
  const update = useContext(NodeEditContext);
  const [options, setOptions] = useState<string[] | null>(null);

  useEffect(() => {
    let cancel = false;
    loadComboOptions(source).then((list) => {
      if (!cancel) setOptions(list);
    });
    return () => {
      cancel = true;
    };
  }, [source]);

  // Do not depend on `value`: the updater reads stored properties and clears autoPick.
  useEffect(() => {
    if (!autoPick || options === null) return;
    const choices = options;
    update(id, (current) => {
      if (!current.autoPick) return current;
      const stored = current.properties[field.key];
      const storedText = stored === undefined || stored === null ? "" : String(stored);
      const pick =
        choices.length > 0 && (storedText === "" || !choices.includes(storedText)) ? choices[0] : null;
      const properties =
        pick === null || stored === pick ? current.properties : { ...current.properties, [field.key]: pick };
      return { ...current, autoPick: false, properties };
    });
  }, [autoPick, options, id, field.key, update]);

  const shown = options ?? [];
  const keepCurrent = value !== "" && !shown.includes(value);

  return (
    <label className="bruh-node__field bruh-node__field--combo" style={singleLineFieldStyle}>
      <span className="bruh-node__label">{field.label}</span>
      <select
        className="nodrag nopan nowheel nokey"
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          const next = event.target.value;
          update(id, (current) => ({
            ...current,
            autoPick: false,
            properties: { ...current.properties, [field.key]: next },
          }));
        }}
      >
        <option value="">{shown.length === 0 && options !== null ? "None" : "Select…"}</option>
        {keepCurrent && <option value={value}>{value}</option>}
        {shown.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default memo(FlowNode);
