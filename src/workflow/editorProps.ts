export interface WorkflowEditorProps {
  getActive: () => boolean;
  subscribeActive: (listener: (active: boolean) => void) => () => void;
  onSaved: () => void;
}
