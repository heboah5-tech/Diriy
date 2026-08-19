import { supabase } from "./supabase";

export type User = {
  uid: string;
  id: string;
  email: string | null;
};

export type AuthHandle = { __isAuthHandle: true };

export const auth: AuthHandle | null = supabase
  ? ({ __isAuthHandle: true } as AuthHandle)
  : null;

const toUser = (sessionUser: any | null | undefined): User | null => {
  if (!sessionUser) return null;
  return {
    uid: sessionUser.id,
    id: sessionUser.id,
    email: sessionUser.email ?? null,
  };
};

export const getAuth = () => auth;

const wrapAuthError = (error: any): Error & { code?: string } => {
  const message = String(error?.message ?? "Authentication error");
  const code = (() => {
    const m = message.toLowerCase();
    if (m.includes("invalid login") || m.includes("invalid credentials")) {
      return "auth/invalid-credential";
    }
    if (m.includes("user not found")) return "auth/user-not-found";
    if (m.includes("password")) return "auth/wrong-password";
    return "auth/unknown";
  })();
  const err = new Error(message) as Error & { code?: string };
  err.code = code;
  return err;
};

export const signInWithEmailAndPassword = async (
  _auth: AuthHandle | null,
  email: string,
  password: string,
) => {
  if (!supabase) throw new Error("Auth not initialized");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw wrapAuthError(error);
  return { user: toUser(data.user) };
};

export const signOut = async (_auth: AuthHandle | null) => {
  if (!supabase) return;
  await supabase.auth.signOut();
};

export const onAuthStateChanged = (
  _auth: AuthHandle | null,
  callback: (user: User | null) => void,
): (() => void) => {
  if (!supabase) {
    callback(null);
    return () => {};
  }

  // Fire initial state.
  supabase.auth.getSession().then(({ data }) => {
    callback(toUser(data.session?.user));
  });

  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(toUser(session?.user));
  });

  return () => sub.subscription.unsubscribe();
};
