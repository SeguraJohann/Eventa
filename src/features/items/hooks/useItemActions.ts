// UI-facing actions: wrap services with the uid and chain the follow-up dialogs
// (M11 confirm delete, M12 "mark as finished?").

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { DateKey, Item, ItemStatus, Occurrence, Placement, RecurrenceRule, TimeKey } from "@/types/models";
import { useUid } from "@/features/auth/AuthContext";
import { useModals } from "@/features/modals/ModalContext";
import * as items from "@/features/items/services/items.service";
import * as occ from "@/features/occurrences/services/occurrences.service";
import * as pl from "@/features/placements/services/placements.service";
import { setDayNote } from "@/features/days/services/days.service";
import { aliveIndex, descendantsOf } from "@/lib/tree/tree";
import { es, fmt } from "@/i18n";
import { paths } from "@/routes/paths";
import { toast } from "@/lib/utils/toast";

export function useItemActions() {
  const uid = useUid();
  const { open } = useModals();
  const navigate = useNavigate();

  return useMemo(() => {
    const t = es;
    return {
      // ----- completion -----
      toggleNode(item: Item, nodeId: string | null, checked: boolean) {
        const completedAll = items.toggleItemNode(uid, item, nodeId, checked);
        if (completedAll && item.status === "active") open({ type: "completed", itemId: item.id });
      },
      toggleOccurrence(item: Item, originalDate: DateKey, doc: Occurrence | null, nodeId: string | null, checked: boolean) {
        occ.toggleOccurrence(uid, item, originalDate, doc, nodeId, checked);
      },
      skipOccurrence(item: Item, originalDate: DateKey, doc: Occurrence | null, skipped: boolean) {
        occ.setOccurrenceSkipped(uid, item, originalDate, doc, skipped);
      },
      moveOccurrence(item: Item, originalDate: DateKey, doc: Occurrence | null, to: DateKey | null) {
        occ.moveOccurrence(uid, item, originalDate, doc, to);
      },
      setOccurrenceTime(item: Item, originalDate: DateKey, doc: Occurrence | null, start: TimeKey | null, end: TimeKey | null) {
        occ.setOccurrenceTime(uid, item, originalDate, doc, start, end);
      },
      rescheduleOccurrence(item: Item, originalDate: DateKey, doc: Occurrence | null, date: DateKey, start: TimeKey | null, end: TimeKey | null) {
        occ.rescheduleOccurrence(uid, item, originalDate, doc, date, start, end);
      },

      // ----- status -----
      setStatus(item: Item, status: ItemStatus) {
        items.setItemStatus(uid, item, status);
      },
      setPinned(item: Item, pinned: boolean) {
        items.setPinned(uid, item, pinned);
      },
      duplicate(item: Item) {
        const id = items.duplicateItem(uid, item, t.menu.duplicateSuffix);
        navigate(paths.item(id));
      },
      confirmDelete(item: Item, placementsCount: number, historyCount: number) {
        const n = aliveIndex(item.nodes).order.length;
        const lines: string[] = [];
        if (n > 0) lines.push(fmt(t.confirmDelete.subtasks, { n }));
        if (historyCount > 0) lines.push(fmt(t.confirmDelete.history, { n: historyCount }));
        if (placementsCount > 0) lines.push(fmt(t.confirmDelete.days, { n: placementsCount }));
        lines.push(t.confirmDelete.irreversible);
        open({
          type: "confirm",
          title: fmt(t.confirmDelete.title, { title: item.title }),
          lines,
          confirmLabel: t.common.delete,
          danger: true,
          onConfirm: () => {
            navigate(paths.events);
            void items.deleteItem(uid, item);
          },
        });
      },

      // ----- tree -----
      addNode(item: Item, parentId: string | null, title: string): string {
        return items.addNode(uid, item, parentId, title);
      },
      updateNode(item: Item, nodeId: string, patch: items.NodePatch) {
        items.updateNode(uid, item, nodeId, patch);
      },
      moveNode(item: Item, nodeId: string, parentId: string | null, position: number) {
        return items.moveNode(uid, item, nodeId, parentId, position);
      },
      confirmDeleteNode(item: Item, nodeId: string, placementsCount: number, onDone?: () => void) {
        const n = descendantsOf(aliveIndex(item.nodes), nodeId).length;
        const lines: string[] = [];
        if (n > 0) lines.push(fmt(t.confirmDelete.subtasks, { n }));
        if (placementsCount > 0) lines.push(fmt(t.confirmDelete.days, { n: placementsCount }));
        if (item.scheduleMode === "repeat") lines.push(t.confirmDelete.repeatingSubtask);
        open({
          type: "confirm",
          title: fmt(t.confirmDelete.subtaskTitle, { title: item.nodes[nodeId]?.title ?? "" }),
          lines,
          confirmLabel: t.common.delete,
          danger: true,
          onConfirm: () => {
            void items.deleteNode(uid, item, nodeId);
            onDone?.();
          },
        });
      },

      // ----- placements -----
      place(item: Item, input: pl.PlacementInput) {
        pl.createPlacement(uid, item, input);
      },
      updatePlacement(p: Placement, patch: pl.PlacementPatch) {
        pl.updatePlacement(uid, p, patch);
      },
      removePlacement(p: Placement) {
        pl.deletePlacement(uid, p.id);
      },
      dismissPlacement(p: Placement) {
        pl.dismissPlacement(uid, p);
      },

      // ----- items (form) -----
      create(draft: items.ItemDraft): string {
        const id = items.createItem(uid, draft);
        toast(t.form.created);
        return id;
      },
      update(before: Item, draft: items.ItemDraft) {
        void items.updateItem(uid, before, draft);
        toast(t.form.saved);
      },
      split(before: Item, fromDate: DateKey, draft: items.ItemDraft) {
        void items.splitItem(uid, before, fromDate, draft).then((id) => {
          if (id !== before.id) navigate(paths.item(id), { replace: true });
        });
        toast(t.form.saved);
      },

      updateRecurrence(item: Item, rule: RecurrenceRule) {
        items.updateRecurrence(uid, item, rule);
      },

      // ----- day -----
      setNote(date: DateKey, note: string) {
        setDayNote(uid, date, note);
      },
    };
  }, [uid, open, navigate]);
}

export type ItemActions = ReturnType<typeof useItemActions>;
