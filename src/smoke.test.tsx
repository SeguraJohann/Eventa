// @vitest-environment jsdom
// Smoke tests: every screen and modal renders with sample data and the data
// layer mocked (no Firebase). Catches runtime crashes in the UI.

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import type { Item, Occurrence, Placement, TreeNode } from "@/types/models";
import { occurrenceId } from "@/types/models";
import { addDays, todayKey, weekdayOf } from "@/lib/date/dateKey";
import { agendaForRange } from "@/lib/agenda/agenda";

const today = todayKey();

const node = (parentId: string | null, title: string, extra: Partial<TreeNode> = {}): TreeNode => ({
  parentId,
  title,
  position: 1,
  notes: null,
  dueDate: null,
  estimateMin: null,
  completedAt: null,
  completedOn: null,
  weekdays: null,
  addedOn: addDays(today, -60),
  removedOn: null,
  ...extra,
});

const base = (id: string, extra: Partial<Item>): Item => ({
  id,
  title: id,
  notes: null,
  color: null,
  category: null,
  scheduleMode: "none",
  timeMode: "none",
  startTime: null,
  endTime: null,
  recurrence: null,
  pauses: [],
  completion: "check",
  background: false,
  status: "active",
  statusChangedAt: 0,
  dueDate: null,
  estimateMin: null,
  completedAt: null,
  completedOn: null,
  nodes: {},
  pinned: false,
  pinnedPosition: null,
  splitFromItemId: null,
  createdOn: addDays(today, -60),
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

const rule = (extra: Partial<NonNullable<Item["recurrence"]>> = {}) => ({
  type: "weekdays" as const,
  weekdays: [weekdayOf(today), weekdayOf(addDays(today, 2))],
  interval: null,
  cycle: null,
  startDate: addDays(today, -60),
  endType: "never" as const,
  endDate: null,
  endCount: null,
  ...extra,
});

const ITEMS: Item[] = [
  base("office", { title: "Oficina", scheduleMode: "repeat", timeMode: "timed", startTime: "08:00", endTime: "17:00", completion: "block", background: true, recurrence: rule() }),
  base("gym", {
    title: "Gimnasio",
    scheduleMode: "repeat",
    timeMode: "timed",
    startTime: "18:30",
    endTime: "19:30",
    recurrence: rule({ type: "week_cycle", cycle: [{ weekdays: [1, 2, 3, 4, 5, 6, 7] }, { weekdays: [1, 2] }] }),
    nodes: { warm: node(null, "Calentar"), legs: node(null, "Piernas", { weekdays: [1] }), sq: node("legs", "Sentadillas") },
    pinned: true,
  }),
  base("read", { title: "Leer", scheduleMode: "repeat", recurrence: rule({ type: "daily" }) }),
  base("inv", {
    title: "Inventario",
    dueDate: addDays(today, 20),
    nodes: { db: node(null, "Base de datos", { completedAt: 1, completedOn: addDays(today, -1) }), rep: node(null, "Reportes"), f1: node("rep", "Filtro", { estimateMin: 60 }) },
  }),
  base("bread", { title: "Comprar pan", scheduleMode: "days" }),
];

const PLACEMENTS: Placement[] = [
  { id: "p1", itemId: "inv", nodeId: "f1", date: today, timeMode: "timed", startTime: "09:00", endTime: "11:00", position: 0, dismissed: false, open: true, createdAt: 0, updatedAt: 0 },
  { id: "p2", itemId: "bread", nodeId: null, date: today, timeMode: "none", startTime: null, endTime: null, position: 1, dismissed: false, open: true, createdAt: 0, updatedAt: 0 },
  { id: "p3", itemId: "inv", nodeId: "rep", date: addDays(today, -1), timeMode: "none", startTime: null, endTime: null, position: 0, dismissed: false, open: true, createdAt: 0, updatedAt: 0 },
];

const OCC: Occurrence[] = [
  { id: occurrenceId("gym", addDays(today, -7)), itemId: "gym", originalDate: addDays(today, -7), effectiveDate: addDays(today, -7), movedToDate: null, startTime: null, endTime: null, status: "done", done: { warm: 1, sq: 1 }, doneCount: 2, totalCount: 2, updatedAt: 0 },
  { id: occurrenceId("read", addDays(today, -1)), itemId: "read", originalDate: addDays(today, -1), effectiveDate: addDays(today, -1), movedToDate: null, startTime: null, endTime: null, status: "skipped", done: {}, doneCount: 0, totalCount: 1, updatedAt: 0 },
];

const lookupItem = (id: string) => ITEMS.find((i) => i.id === id);
const occMap = () => new Map(OCC.map((o) => [o.id, o]));

vi.mock("@/config/firebase", () => ({ firebaseConfigured: true, auth: {}, db: {}, googleProvider: {} }));
vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u", email: "yo@example.com", displayName: "Yo", photoURL: null }, loading: false, signIn: async () => {}, signOutUser: async () => {} }),
  useUid: () => "u",
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/features/data/ItemsContext", () => ({
  useItemsData: () => ({ items: ITEMS, loading: false, error: false, lookupItem, ensureItems: () => {}, retainInactive: () => () => {}, inactive: [], inactiveLoading: false }),
  ItemsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/features/items/hooks/useItemActions", () => ({
  useItemActions: () => new Proxy({}, { get: () => () => "id" }),
}));
vi.mock("@/features/data/hooks", () => ({
  usePlacementsRange: () => ({ data: PLACEMENTS, loading: false }),
  useOpenPlacements: () => ({ data: PLACEMENTS, loading: false }),
  useItemPlacements: (id: string | null) => ({ data: PLACEMENTS.filter((p) => p.itemId === id), loading: false }),
  useOccurrencesRange: () => ({ data: occMap(), loading: false }),
  useItemOccurrences: (id: string | null) => ({ data: OCC.filter((o) => o.itemId === id), loading: false }),
  useChainOccurrences: (ids: string[]) => ({ data: new Map(ids.map((id) => [id, new Map(OCC.filter((o) => o.itemId === id).map((o) => [o.id, o]))])), loading: false }),
  useDay: () => ({ data: { date: today, note: "Nota", log: { a: { itemId: "inv", nodeId: "db", occurrenceDate: null, title: "Base de datos", itemTitle: "Inventario", at: 1 } }, updatedAt: 0 }, loading: false }),
  useDaysRange: () => ({ data: new Map(), loading: false }),
  useAgenda: (from: string, to: string) => ({ byDay: agendaForRange({ items: ITEMS, lookupItem, placements: PLACEMENTS, occurrences: occMap(), today }, from, to), loading: false }),
  useOverdue: () => ({ list: [{ placement: PLACEMENTS[2], item: ITEMS[3] }], loading: false }),
  useItem: (id: string | undefined) => ({ item: id ? lookupItem(id) : undefined, loading: false }),
}));

const { ClockProvider } = await import("@/features/data/ClockContext");
const { ModalProvider, useModals } = await import("@/features/modals/ModalContext");
const { ModalHost } = await import("@/features/modals/ModalHost");
const { AppLayout } = await import("@/routes/AppLayout");
const { TodayScreen } = await import("@/features/today/components/TodayScreen");
const CalendarScreen = (await import("@/features/calendar/components/CalendarScreen")).default;
const EventsScreen = (await import("@/features/events/components/EventsScreen")).default;
const DetailScreen = (await import("@/features/detail/components/DetailScreen")).default;
type ModalSpec = import("@/features/modals/ModalContext").ModalSpec;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as never;
});
afterEach(cleanup);

function Shell({ url, children }: { url: string; children?: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={[url]}>
      <ClockProvider>
        <ModalProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/hoy" element={<TodayScreen />} />
              <Route path="/calendario" element={<CalendarScreen />} />
              <Route path="/eventos" element={<EventsScreen />} />
              <Route path="/eventos/:id" element={<DetailScreen />} />
            </Route>
          </Routes>
          {children}
          <ModalHost />
        </ModalProvider>
      </ClockProvider>
    </MemoryRouter>
  );
}

function Opener({ spec }: { spec: ModalSpec }) {
  const { open } = useModals();
  useEffect(() => open(spec), [open, spec]);
  return null;
}

describe("screens render", () => {
  it("today", () => {
    const r = render(<Shell url="/hoy" />);
    expect(r.getAllByText("Comprar pan").length).toBeGreaterThan(0);
    expect(r.getByText("Pendiente de días anteriores")).toBeTruthy();
    expect(r.getAllByText("Oficina").length).toBeGreaterThan(0);
  });
  for (const mode of ["mes", "semana", "dia"]) {
    it(`calendar ${mode}`, () => {
      const r = render(<Shell url={`/calendario?modo=${mode}&fecha=${today}`} />);
      expect(r.container.textContent).toContain("Calendario");
    });
  }
  it("events", () => {
    const r = render(<Shell url="/eventos" />);
    expect(r.getAllByText("Inventario").length).toBeGreaterThan(0);
    expect(r.container.textContent).toContain("Todos 5");
  });
  for (const id of ["inv", "gym", "office", "bread", "nope"]) {
    it(`detail ${id}`, () => {
      const r = render(<Shell url={`/eventos/${id}?nodo=f1`} />);
      expect(r.container.textContent!.length).toBeGreaterThan(10);
    });
  }
});

const SPECS: ModalSpec[] = [
  { type: "addToDay", date: today, startTime: "10:00", endTime: "11:00" },
  { type: "itemForm", mode: "create", date: today, startTime: "10:00" },
  { type: "itemForm", mode: "edit", itemId: "inv" },
  { type: "itemForm", mode: "edit", itemId: "gym", fromOccurrence: { originalDate: today } },
  { type: "recurrence", rule: rule({ type: "week_cycle", cycle: [{ weekdays: [1] }] }), onDone: () => {} },
  { type: "place", date: today },
  { type: "occurrence", itemId: "gym", originalDate: today },
  { type: "scope", date: today, allowOnly: true, onPick: () => {} },
  { type: "itemMenu", itemId: "inv" },
  { type: "subtask", itemId: "inv", nodeId: "f1" },
  { type: "subtask", itemId: "gym", nodeId: "legs" },
  { type: "moveNode", itemId: "inv", nodeId: "f1" },
  { type: "pastOccurrence", itemId: "gym", originalDate: addDays(today, -7) },
  { type: "confirm", title: "¿Eliminar?", lines: ["a"], confirmLabel: "Eliminar", onConfirm: () => {} },
  { type: "completed", itemId: "inv" },
  { type: "reschedule", placement: PLACEMENTS[2] },
  { type: "dayNote", date: today },
  { type: "paste", onAdd: () => {} },
  { type: "pickDate", title: "Día", initial: today, onPick: () => {} },
  { type: "pickTime", title: "Hora", startTime: "09:00", endTime: "10:00", onPick: () => {} },
];

describe("modals render", () => {
  for (const spec of SPECS) {
    it(`${spec.type}${"mode" in spec ? `/${spec.mode}` : ""}`, () => {
      const r = render(
        <Shell url="/hoy">
          <Opener spec={spec} />
        </Shell>,
      );
      expect(r.baseElement.querySelector("[data-sheet]")).toBeTruthy();
    });
  }
});
