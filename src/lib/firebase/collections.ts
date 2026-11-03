// Typed Firestore references. ONLY services import from lib/firebase.

import { collection, doc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { dayConverter, itemConverter, occurrenceConverter, placementConverter } from "./converters";

export const userDoc = (uid: string) => doc(db, "users", uid);

export const itemsCol = (uid: string) => collection(db, "users", uid, "items").withConverter(itemConverter);
export const itemsRawCol = (uid: string) => collection(db, "users", uid, "items");
export const itemDoc = (uid: string, id: string) => doc(db, "users", uid, "items", id);

export const placementsCol = (uid: string) => collection(db, "users", uid, "placements").withConverter(placementConverter);
export const placementsRawCol = (uid: string) => collection(db, "users", uid, "placements");
export const placementDoc = (uid: string, id: string) => doc(db, "users", uid, "placements", id);

export const occurrencesCol = (uid: string) => collection(db, "users", uid, "occurrences").withConverter(occurrenceConverter);
export const occurrenceDoc = (uid: string, id: string) => doc(db, "users", uid, "occurrences", id);

export const daysCol = (uid: string) => collection(db, "users", uid, "days").withConverter(dayConverter);
export const dayDoc = (uid: string, date: string) => doc(db, "users", uid, "days", date);

export { db };
