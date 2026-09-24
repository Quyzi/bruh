import type { WorkflowEditorProps } from "./editorProps";

interface EditorModule {
  mountWorkflowEditor: (host: HTMLElement, props: WorkflowEditorProps) => () => void;
}

const loaders = import.meta.glob<EditorModule>("./ui/WorkflowEditor.tsx");

/** Mount the React Flow editor into a Solid-owned element. Returns an unmount function. */
export function mountWorkflow(host: HTMLElement, props: WorkflowEditorProps): () => void {
  const load = loaders["./ui/WorkflowEditor.tsx"];
  if (!load) {
    throw new Error("Workflow editor was not bundled");
  }
  let unmount = () => {};
  let cancel = false;
  void load().then((mod) => {
    if (cancel) return;
    unmount = mod.mountWorkflowEditor(host, props);
  });
  return () => {
    cancel = true;
    unmount();
  };
}
