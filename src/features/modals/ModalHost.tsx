import { useModals, type ModalSpec } from "./ModalContext";
import { useItem } from "@/features/data/hooks";
import { ItemForm } from "@/features/items/components/ItemForm";
import { RecurrenceEditor } from "./components/RecurrenceEditor";
import { AddToDaySheet, DayNoteSheet, PickDateSheet, PickTimeSheet, PlaceSheet, RescheduleSheet } from "./components/DaySheets";
import { OccurrenceSheet, PastOccurrenceSheet, ScopeSheet } from "./components/OccurrenceSheets";
import { CompletedSheet, ConfirmSheet, ItemMenuSheet, MoveNodeSheet, PasteSheet, SubtaskSheet } from "./components/ItemSheets";
import { Sheet } from "@/components/ui/Sheet";
import { Loading } from "@/components/ui/misc";

function EditForm({ itemId, fromOccurrence, onClose }: { itemId: string; fromOccurrence?: { originalDate: string }; onClose: () => void }) {
  const { item } = useItem(itemId);
  if (!item) return <Sheet onClose={onClose}>{<Loading />}</Sheet>;
  return <ItemForm item={item} fromOccurrence={fromOccurrence} onClose={onClose} />;
}

function render(spec: ModalSpec, close: () => void) {
  switch (spec.type) {
    case "addToDay":
      return <AddToDaySheet date={spec.date} startTime={spec.startTime} endTime={spec.endTime} onClose={close} />;
    case "itemForm":
      return spec.mode === "create" ? (
        <ItemForm preset={{ date: spec.date, startTime: spec.startTime, endTime: spec.endTime }} onClose={close} />
      ) : (
        <EditForm itemId={spec.itemId} fromOccurrence={spec.fromOccurrence} onClose={close} />
      );
    case "recurrence":
      return <RecurrenceEditor rule={spec.rule} onDone={spec.onDone} onClose={close} />;
    case "place":
      return <PlaceSheet date={spec.date} itemId={spec.itemId} nodeId={spec.nodeId} startTime={spec.startTime} endTime={spec.endTime} onClose={close} />;
    case "occurrence":
      return <OccurrenceSheet itemId={spec.itemId} originalDate={spec.originalDate} onClose={close} />;
    case "scope":
      return <ScopeSheet date={spec.date} allowOnly={spec.allowOnly} onPick={spec.onPick} onClose={close} />;
    case "itemMenu":
      return <ItemMenuSheet itemId={spec.itemId} onClose={close} />;
    case "subtask":
      return <SubtaskSheet itemId={spec.itemId} nodeId={spec.nodeId} onClose={close} />;
    case "moveNode":
      return <MoveNodeSheet itemId={spec.itemId} nodeId={spec.nodeId} onClose={close} />;
    case "pastOccurrence":
      return <PastOccurrenceSheet itemId={spec.itemId} originalDate={spec.originalDate} onClose={close} />;
    case "confirm":
      return <ConfirmSheet title={spec.title} lines={spec.lines} confirmLabel={spec.confirmLabel} danger={spec.danger} onConfirm={spec.onConfirm} onClose={close} />;
    case "completed":
      return <CompletedSheet itemId={spec.itemId} onClose={close} />;
    case "reschedule":
      return <RescheduleSheet placement={spec.placement} onClose={close} />;
    case "dayNote":
      return <DayNoteSheet date={spec.date} onClose={close} />;
    case "paste":
      return <PasteSheet onAdd={spec.onAdd} onClose={close} />;
    case "pickDate":
      return <PickDateSheet title={spec.title} initial={spec.initial} onPick={spec.onPick} onClose={close} />;
    case "pickTime":
      return <PickTimeSheet title={spec.title} startTime={spec.startTime} endTime={spec.endTime} onPick={spec.onPick} onClose={close} />;
  }
}

/** Renders the modal stack; only the top-most one handles Escape. */
export function ModalHost() {
  const { stack, close } = useModals();
  return (
    <>
      {stack.map((entry) => (
        <div key={entry.id}>{render(entry.spec, close)}</div>
      ))}
    </>
  );
}
