import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { DateKey, TimeKey } from "@/types/models";
import type { AgendaEntry } from "@/lib/agenda/agenda";
import { useItemActions } from "@/features/items/hooks/useItemActions";
import { useModals } from "@/features/modals/ModalContext";
import { paths } from "@/routes/paths";

/** What happens when an entry of a day is tapped, checked or dragged. */
export function useEntryHandlers() {
  const actions = useItemActions();
  const { open } = useModals();
  const navigate = useNavigate();

  return useMemo(
    () => ({
      onTap(e: AgendaEntry) {
        if (e.kind === "occurrence" && e.occurrence) {
          open({ type: "occurrence", itemId: e.item.id, originalDate: e.occurrence.originalDate });
        } else {
          navigate(paths.item(e.item.id, { node: e.nodeId, date: e.date }));
        }
      },
      onToggle(e: AgendaEntry, checked: boolean) {
        if (e.kind === "occurrence" && e.occurrence) {
          actions.toggleOccurrence(e.item, e.occurrence.originalDate, e.occurrence.doc, null, checked);
        } else {
          actions.toggleNode(e.item, e.nodeId, checked);
        }
      },
      onMove(e: AgendaEntry, date: DateKey, start: TimeKey, end: TimeKey) {
        if (e.kind === "occurrence" && e.occurrence) {
          actions.rescheduleOccurrence(e.item, e.occurrence.originalDate, e.occurrence.doc, date, start, end);
        } else if (e.placement) {
          actions.updatePlacement(e.placement, { date, timeMode: "timed", startTime: start, endTime: end });
        }
      },
    }),
    [actions, open, navigate],
  );
}
