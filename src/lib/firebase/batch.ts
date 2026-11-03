// Batch helper that splits into several commits past Firestore's 500-op limit.

import { writeBatch, type DocumentData, type DocumentReference, type SetOptions, type UpdateData, type WriteBatch } from "firebase/firestore";
import { db } from "@/config/firebase";
import { reportError } from "@/lib/utils/errors";

const LIMIT = 450;

export class ChunkedBatch {
  private batches: WriteBatch[] = [writeBatch(db)];
  private count = 0;

  private current(): WriteBatch {
    if (this.count >= LIMIT) {
      this.batches.push(writeBatch(db));
      this.count = 0;
    }
    this.count++;
    return this.batches[this.batches.length - 1];
  }

  set(ref: DocumentReference, data: DocumentData, options?: SetOptions): this {
    if (options) this.current().set(ref, data, options);
    else this.current().set(ref, data);
    return this;
  }

  update(ref: DocumentReference, data: UpdateData<DocumentData>): this {
    this.current().update(ref, data);
    return this;
  }

  delete(ref: DocumentReference): this {
    this.current().delete(ref);
    return this;
  }

  get size(): number {
    return (this.batches.length - 1) * LIMIT + this.count;
  }

  /**
   * Commits every chunk. Offline, Firestore resolves commits only once the server
   * acknowledges them, so callers should not await this for UI feedback.
   */
  async commit(): Promise<void> {
    // In parallel: offline, a commit only resolves once the server acknowledges it.
    await Promise.all(this.batches.map((b) => b.commit()));
  }
}

/**
 * Fire-and-forget commit: local listeners update immediately (also offline);
 * failures are reported through the global error channel.
 */
export function commitInBackground(batch: ChunkedBatch): void {
  batch.commit().catch(reportError);
}
