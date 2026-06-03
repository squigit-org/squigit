import React from "react";
import { useAppContext } from "@/app/providers/AppProvider";
import { AuthButton } from "@/app/layout/frame/AuthButton";
import { AppLogo } from "@/components/icons/brand-icons";
import { Loader2 } from "lucide-react";
import styles from "./AuthStep.module.css";

interface AuthStepProps {
  setCustomAction?: (
    action: { label: string; onClick: () => void; disabled?: boolean } | null,
  ) => void;
}

export const AuthStep: React.FC<AuthStepProps> = ({ setCustomAction }) => {
  const app = useAppContext();
  const [authState, setAuthState] = React.useState<
    "idle" | "redirecting" | "awaiting" | "success" | "error"
  >(() => (app.system.activeProfile ? "success" : "idle"));
  const [userName, setUserName] = React.useState<string | null>(
    () => app.system.activeProfile?.name || null,
  );
  const isCancelledRef = React.useRef(false);

  React.useEffect(() => {
    if (!app.system.activeProfile) {
      setAuthState("idle");
      setUserName(null);
    } else {
      setAuthState("success");
      setUserName(app.system.activeProfile.name);
    }
  }, [app.system.activeProfile]);

  const handleLogin = async () => {
    isCancelledRef.current = false;
    setAuthState("redirecting");
    const result = await app.system.addAccount();

    if (isCancelledRef.current) {
      return; // Skip state updates if cancelled
    }
    if (result) {
      setAuthState("awaiting");

      // Crucial: Actually switch to the new profile so isAuthDone becomes true and the Next button is enabled
      await app.system.switchProfile(result.id);

      // Artificial delay for brand EGO (at least 2 seconds)
      await new Promise((resolve) => setTimeout(resolve, 2500));

      setUserName(result.name);
      setAuthState("success");
    } else {
      setAuthState("error");
    }
  };

  const handleCancel = async () => {
    isCancelledRef.current = true;
    await app.system.cancelAuth();
    setAuthState("idle");
  };

  React.useEffect(() => {
    if (authState === "redirecting") {
      setCustomAction?.({ label: "Cancel", onClick: handleCancel });
    } else if (authState === "error") {
      setCustomAction?.({ label: "Retry", onClick: handleLogin });
    } else if (authState === "awaiting") {
      setCustomAction?.({ label: "Next", onClick: () => {}, disabled: true });
    } else {
      setCustomAction?.(null);
    }
  }, [authState, setCustomAction]);

  return (
    <div className={styles.container}>
      <div className={styles.branding}>
        <AppLogo size={64} color="var(--c-raw-050)" />
        <h1 className={styles.title}>Welcome to Squigit</h1>
      </div>
      <div className={styles.authWrapper}>
        {authState === "awaiting" && (
          <div className={styles.standaloneState}>
            <Loader2 size={18} className={styles.spin} /> Awaiting
            Authentication
          </div>
        )}
        {authState === "success" && (
          <div className={styles.standaloneState}>
            Welcome back, {userName?.split(" ")[0]}
          </div>
        )}
        {(authState === "idle" ||
          authState === "redirecting" ||
          authState === "error") && (
          <AuthButton
            onLogin={handleLogin}
            onCancel={handleCancel}
            authState={authState}
            userName={userName}
            wizard={true}
          />
        )}
      </div>
    </div>
  );
};
