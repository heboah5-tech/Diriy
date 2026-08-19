import { supabase } from "./supabase";

const ARRAY_UNION = Symbol("arrayUnion");
const ARRAY_REMOVE = Symbol("arrayRemove");
const SERVER_TS = Symbol("serverTimestamp");

type Sentinel =
  | { __op: typeof ARRAY_UNION; value: unknown }
  | { __op: typeof ARRAY_REMOVE; value: unknown }
  | { __op: typeof SERVER_TS };

const isSentinel = (v: any): v is Sentinel =>
  v && typeof v === "object" && "__op" in v;

export const arrayUnion = (value: unknown): Sentinel => ({
  __op: ARRAY_UNION,
  value,
});

export const arrayRemove = (value: unknown): Sentinel => ({
  __op: ARRAY_REMOVE,
  value,
});

export const serverTimestamp = (): Sentinel => ({ __op: SERVER_TS });

export type DbHandle = { __isDbHandle: true };
export const db: DbHandle | null = supabase
  ? ({ __isDbHandle: true } as DbHandle)
  : null;

export type DocumentReference = {
  __type: "doc";
  collection: string;
  id: string;
  path: string;
};

export type CollectionReference = {
  __type: "collection";
  name: string;
};

export type Query = CollectionReference;

export const collection = (
  _db: DbHandle | null,
  name: string,
): CollectionReference => ({ __type: "collection", name });

export const doc = (
  _db: DbHandle | null,
  collectionName: string,
  id: string,
): DocumentReference => ({
  __type: "doc",
  collection: collectionName,
  id,
  path: `${collectionName}/${id}`,
});

export const query = (coll: CollectionReference, ..._rest: any[]): Query =>
  coll;

const resolveSentinels = (data: any, existing: any): any => {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data;
  if (typeof data !== "object") return data;
  if (isSentinel(data)) {
    if (data.__op === SERVER_TS) return new Date().toISOString();
    if (data.__op === ARRAY_UNION) {
      const arr = Array.isArray(existing) ? [...existing] : [];
      if (!arr.includes(data.value)) arr.push(data.value);
      return arr;
    }
    if (data.__op === ARRAY_REMOVE) {
      const arr = Array.isArray(existing) ? [...existing] : [];
      return arr.filter((x) => x !== data.value);
    }
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = resolveSentinels(v, existing?.[k]);
  }
  return out;
};

const fetchRow = async (collectionName: string, id: string) => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(collectionName)
    .select("data")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (error.code !== "PGRST116") {
      console.error(`Supabase read error (${collectionName}/${id}):`, error);
    }
    return null;
  }
  return (data?.data as any) ?? null;
};

const writeRow = async (
  collectionName: string,
  id: string,
  payload: any,
  merge: boolean,
) => {
  if (!supabase) return;
  let nextData: any = payload;
  if (merge) {
    const existing = (await fetchRow(collectionName, id)) ?? {};
    const resolved = resolveSentinels(payload, existing);
    nextData = { ...existing, ...resolved };
  } else {
    nextData = resolveSentinels(payload, {});
  }
  const { error } = await supabase
    .from(collectionName)
    .upsert(
      { id, data: nextData, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (error) {
    console.error(`Supabase write error (${collectionName}/${id}):`, error);
    throw error;
  }
};

export const setDoc = async (
  ref: DocumentReference,
  data: any,
  options?: { merge?: boolean },
) => {
  await writeRow(ref.collection, ref.id, data, options?.merge === true);
};

export const updateDoc = async (ref: DocumentReference, data: any) => {
  await writeRow(ref.collection, ref.id, data, true);
};

export const deleteDoc = async (ref: DocumentReference) => {
  if (!supabase) return;
  const { error } = await supabase
    .from(ref.collection)
    .delete()
    .eq("id", ref.id);
  if (error) {
    console.error(`Supabase delete error (${ref.path}):`, error);
    throw error;
  }
};

export type DocumentSnapshot = {
  exists: () => boolean;
  data: () => any;
  id: string;
  ref: DocumentReference;
};

const buildDocSnapshot = (
  ref: DocumentReference,
  rowData: any | null,
): DocumentSnapshot => {
  const exists = rowData !== null && rowData !== undefined;
  return {
    exists: () => exists,
    data: () => (exists ? { id: ref.id, ...rowData } : undefined),
    id: ref.id,
    ref,
  };
};

export const getDoc = async (
  ref: DocumentReference,
): Promise<DocumentSnapshot> => {
  const data = await fetchRow(ref.collection, ref.id);
  return buildDocSnapshot(ref, data);
};

export type QueryDocumentSnapshot = {
  id: string;
  ref: DocumentReference;
  data: () => any;
};

export type QuerySnapshot = {
  docs: QueryDocumentSnapshot[];
  forEach: (cb: (doc: QueryDocumentSnapshot) => void) => void;
  size: number;
};

const buildQuerySnapshot = (
  collectionName: string,
  rows: Array<{ id: string; data: any }>,
): QuerySnapshot => {
  const docs: QueryDocumentSnapshot[] = rows.map((row) => {
    const ref: DocumentReference = {
      __type: "doc",
      collection: collectionName,
      id: row.id,
      path: `${collectionName}/${row.id}`,
    };
    return {
      id: row.id,
      ref,
      data: () => ({ id: row.id, ...(row.data ?? {}) }),
    };
  });
  return {
    docs,
    forEach: (cb) => docs.forEach(cb),
    size: docs.length,
  };
};

export const getDocs = async (
  q: Query | CollectionReference,
): Promise<QuerySnapshot> => {
  if (!supabase) return buildQuerySnapshot(q.name, []);
  const { data, error } = await supabase.from(q.name).select("id, data");
  if (error) {
    console.error(`Supabase getDocs error (${q.name}):`, error);
    return buildQuerySnapshot(q.name, []);
  }
  return buildQuerySnapshot(q.name, (data as any[]) ?? []);
};

type Unsubscribe = () => void;

export function onSnapshot(
  ref: DocumentReference,
  cb: (snap: DocumentSnapshot) => void,
  onError?: (err: Error) => void,
): Unsubscribe;
export function onSnapshot(
  q: Query | CollectionReference,
  cb: (snap: QuerySnapshot) => void,
  onError?: (err: Error) => void,
): Unsubscribe;
export function onSnapshot(
  target: any,
  cb: any,
  _onError?: (err: Error) => void,
): Unsubscribe {
  if (!supabase) return () => {};

  if (target && target.__type === "doc") {
    const ref = target as DocumentReference;
    let cancelled = false;

    (async () => {
      const initial = await fetchRow(ref.collection, ref.id);
      if (!cancelled) cb(buildDocSnapshot(ref, initial));
    })();

    const channel = supabase
      .channel(`doc:${ref.collection}:${ref.id}:${Math.random()}`)
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: ref.collection,
          filter: `id=eq.${ref.id}`,
        },
        (payload: any) => {
          if (cancelled) return;
          if (payload.eventType === "DELETE") {
            cb(buildDocSnapshot(ref, null));
            return;
          }
          const rowData = payload.new?.data ?? null;
          cb(buildDocSnapshot(ref, rowData));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase!.removeChannel(channel);
    };
  }

  // Collection / query subscription: refetch all on any change.
  // We coalesce bursts of changes into one refetch via a 50ms timer, and
  // we tag each refetch with a monotonically increasing sequence number so
  // a slower in-flight response cannot overwrite a newer snapshot.
  const coll = target as CollectionReference;
  let cancelled = false;
  let scheduled = false;
  let issuedSeq = 0;
  let appliedSeq = 0;

  const refetch = () => {
    if (cancelled || scheduled) return;
    scheduled = true;
    setTimeout(async () => {
      scheduled = false;
      if (cancelled || !supabase) return;
      const seq = ++issuedSeq;
      const { data, error } = await supabase
        .from(coll.name)
        .select("id, data");
      if (cancelled) return;
      if (error) {
        console.error(`Supabase realtime refetch error (${coll.name}):`, error);
        return;
      }
      if (seq < appliedSeq) return; // a newer refetch already applied
      appliedSeq = seq;
      cb(buildQuerySnapshot(coll.name, (data as any[]) ?? []));
    }, 50);
  };

  refetch();

  const channel = supabase
    .channel(`coll:${coll.name}:${Math.random()}`)
    .on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: coll.name },
      () => refetch(),
    )
    .subscribe();

  return () => {
    cancelled = true;
    supabase!.removeChannel(channel);
  };
}

export const writeBatch = (_db: DbHandle | null) => {
  const ops: Array<() => Promise<void>> = [];
  return {
    delete(ref: DocumentReference) {
      ops.push(async () => {
        await deleteDoc(ref);
      });
    },
    set(ref: DocumentReference, data: any, options?: { merge?: boolean }) {
      ops.push(async () => {
        await setDoc(ref, data, options);
      });
    },
    update(ref: DocumentReference, data: any) {
      ops.push(async () => {
        await updateDoc(ref, data);
      });
    },
    async commit() {
      for (const op of ops) {
        await op();
      }
    },
  };
};
