import { supabase } from "@/integrations/supabase/client";

let bootstrapPromise: Promise<string> | null = null;

/**
 * Ensures the visitor has a Supabase session. We use anonymous sign-in so each
 * browser silently gets its own user id — no signup form. Returns the user id.
 *
 * Also performs a one-time "claim" of any orphan (user_id IS NULL) projects
 * created during the dev-mode period: the very first authenticated user to
 * load the app inherits them. After that there are no orphans left to claim.
 */
export async function ensureSession(): Promise<string> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    try {
      const { data: existing } = await supabase.auth.getSession();
      let userId = existing.session?.user.id;
      if (!userId) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        userId = data.user?.id;
        if (!userId) throw new Error("Anonymous sign-in returned no user");
      }
      // Claim legacy orphan rows (no-op for everyone after the first owner runs it).
      try {
        await supabase.rpc("claim_orphan_projects");
      } catch {
        // non-fatal
      }
      return userId;
    } catch (error) {
      bootstrapPromise = null;
      throw error;
    }
  })();
  return bootstrapPromise;
}

export async function getUserId(): Promise<string> {
  return ensureSession();
}
