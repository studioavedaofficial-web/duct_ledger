import { RegionalFields } from "./RegionalFields";
import {
  suggestedRegion,
  regionPreset,
  setAccountRegion,
  validSettings,
} from "./region";
import { lazy, Suspense, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { accountId, bindAccount } from "./account";
import "./auth.css";
const client = createClient(
  "https://njztmcerqhpthokztdip.supabase.co",
  "sb_publishable_V_B6Al2qnbEThgAY_1xhRw_uAErRRj6",
);
const Workspace = lazy(() => import("./App"));
export default function Auth() {
  const [user, setUser] = useState(""),
    [loading, setLoading] = useState(true),
    [signup, setSignup] = useState(
      () => new URLSearchParams(location.search).get("auth") === "signup",
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [settings, showSettings] = useState(false);
  const [prefs, setPrefs] = useState(() =>
    regionPreset(suggestedRegion(navigator.language)),
  );
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    let current = 0;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const version = ++current;
      if (accountId && accountId !== session?.user.id) {
        location.reload();
        return;
      }
      if (!session) {
        setUser("");
        setLoading(false);
        return;
      }
      if (accountId === session.user.id) return;
      // Run outside the auth notification lock and verify the session remotely.
      setTimeout(async () => {
        const result = await client.auth.getUser(session.access_token);
        if (current !== version) return;
        if (result.data.user) {
          const stored = result.data.user.user_metadata?.regionalSettings;
          const defaults = validSettings(stored) ? stored : regionPreset("PK");
          setAccountRegion(defaults);
          setPrefs(defaults);
          bindAccount(result.data.user.id);
          setUser(result.data.user.email || "Signed in");
        } else
          setMessage(
            "Connect to the internet and sign in to open your workspace.",
          );
        setLoading(false);
      }, 0);
    });
    return () => {
      current++;
      data.subscription.unsubscribe();
    };
  }, []);
  if (loading) return <p className="auth-card">Checking your session…</p>;
  if (user)
    return (
      <>
        <div className="auth-bar">
          {user}{" "}
          <button onClick={() => showSettings(!settings)}>Settings</button>
          <button
            onClick={async () => {
              const { error } = await client.auth.signOut({ scope: "local" });
              if (error) setMessage(error.message);
            }}
          >
            Log out
          </button>{" "}
          <button
            onClick={() => {
              setMessage("");
              setDeleting(true);
            }}
          >
            Delete my account
          </button>
          {message}
        </div>
        {settings && (
          <section className="auth-card">
            <RegionalFields value={prefs} onChange={setPrefs} />
            <button
              onClick={async () => {
                const { error } = await client.auth.updateUser({
                  data: { regionalSettings: prefs },
                });
                if (error) setMessage(error.message);
                else {
                  setAccountRegion(prefs);
                  showSettings(false);
                  setMessage("Defaults saved for new projects.");
                }
              }}
            >
              Save account defaults
            </button>
          </section>
        )}
        {deleting && (
          <section className="auth-card" aria-label="Confirm account deletion">
            <h2>Permanently delete your account?</h2>
            <p>
              You will lose access to this workspace. Project files remain on
              this device. Back up or remove your projects first.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const email = new FormData(e.currentTarget).get("email");
                if (email !== user) {
                  setMessage("Enter your signed-in email exactly.");
                  return;
                }
                setBusy(true);
                setMessage("");
                try {
                  const { data, error } = await client.functions.invoke(
                    "rapid-function",
                    { body: { confirmEmail: email } },
                  );
                  if (error || data?.message !== "Account deleted.") {
                    setMessage(
                      "Could not confirm account deletion. Please try again.",
                    );
                    return;
                  }
                  setUser("");
                  setMessage("Account deleted.");
                  await client.auth.signOut({ scope: "local" });
                } catch {
                  setMessage(
                    "Could not confirm account deletion. Please try again.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Confirm your email
                <input
                  type="email"
                  name="email"
                  autoComplete="off"
                  required
                  autoFocus
                />
              </label>
              <button disabled={busy} type="submit">
                Permanently delete my account
              </button>
              <button
                disabled={busy}
                type="button"
                onClick={() => {
                  setDeleting(false);
                  setMessage("");
                }}
              >
                Cancel
              </button>
            </form>
          </section>
        )}
        <Suspense fallback={<p>Opening workspace…</p>}>
          <Workspace />
        </Suspense>
      </>
    );
  return (
    <main className="auth-card">
      <a href="/">DuctLedger</a>
      <h1>{signup ? "Create an account" : "Log in"}</h1>
      <p>
        Access your HVAC takeoff workspace. Projects are saved in this browser.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const credentials = {
            email: String(form.get("email")).trim(),
            password: String(form.get("password")),
          };
          setBusy(true);
          setMessage("");
          try {
            const result = signup
              ? await client.auth.signUp({
                  ...credentials,
                  options: {
                    data: { regionalSettings: prefs },
                    emailRedirectTo: location.origin + "/workspace/",
                  },
                })
              : await client.auth.signInWithPassword(credentials);
            if (result.error) setMessage(result.error.message);
            else if (signup && !result.data.session)
              setMessage(
                "Check your email to confirm your account, then log in here.",
              );
          } catch {
            setMessage("Connection failed. Please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {signup && <RegionalFields value={prefs} onChange={setPrefs} />}
        <label>
          Email
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete={signup ? "new-password" : "current-password"}
            required
          />
        </label>
        <button disabled={busy}>
          {busy ? "Please wait…" : signup ? "Sign up" : "Log in"}
        </button>
      </form>
      <p role="status">{message}</p>
      <button
        disabled={busy}
        onClick={() => {
          setSignup(!signup);
          setMessage("");
        }}
      >
        {signup ? "Already registered? Log in" : "Create an account"}
      </button>
    </main>
  );
}
