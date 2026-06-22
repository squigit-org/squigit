import React from "react";
import { useAppContext } from "@/app/providers/AppProvider";
import { AuthButton } from "@/app/layout/frame/AuthButton";
import { AppIcon } from "@/components/icons/brand-icons";
import { CheckCircle2, Loader2 } from "lucide-react";
import "@fontsource/geist-sans/300.css";
import "@fontsource/geist-sans/400.css";
import styles from "./AuthStep.module.css";

interface AuthStepProps {
  setCustomAction?: (
    action: { label: string; onClick: () => void; disabled?: boolean } | null,
  ) => void;
}

// Track globally whether the startup animation has already played
let hasAnimatedOnce = false;

export const AuthStep: React.FC<AuthStepProps> = ({ setCustomAction }) => {
  const app = useAppContext();
  const [authState, setAuthState] = React.useState<
    "idle" | "redirecting" | "awaiting" | "success" | "error"
  >(() => (app.system.activeProfile ? "success" : "idle"));
  const [userName, setUserName] = React.useState<string | null>(
    () => app.system.activeProfile?.name || null,
  );
  const [userEmail, setUserEmail] = React.useState<string | null>(
    () => app.system.activeProfile?.email || null,
  );
  const isCancelledRef = React.useRef(false);
  const isAuthenticatingRef = React.useRef(false);

  // Entrance animation: play only once per wizard session
  const [shouldAnimate] = React.useState(() => {
    if (hasAnimatedOnce) return false;
    hasAnimatedOnce = true;
    return true;
  });

  React.useEffect(() => {
    if (isAuthenticatingRef.current) return;
    if (!app.system.activeProfile) {
      setAuthState("idle");
      setUserName(null);
      setUserEmail(null);
    } else {
      setAuthState("success");
      setUserName(app.system.activeProfile.name);
      setUserEmail(app.system.activeProfile.email);
    }
  }, [app.system.activeProfile]);

  const handleLogin = async () => {
    isCancelledRef.current = false;
    isAuthenticatingRef.current = true;
    setAuthState("redirecting");
    const result = await app.system.addAccount();

    if (isCancelledRef.current) {
      isAuthenticatingRef.current = false;
      return;
    }
    if (result) {
      setAuthState("awaiting");

      const delay = 1800 + Math.floor(Math.random() * 4) * 200;
      await Promise.all([
        app.system.switchProfile(result.id),
        new Promise((resolve) => setTimeout(resolve, delay)),
      ]);

      setUserName(result.name);
      setUserEmail(result.email);
      setAuthState("success");
    } else {
      setAuthState("error");
    }
    isAuthenticatingRef.current = false;
  };

  const handleCancel = async () => {
    isCancelledRef.current = true;
    isAuthenticatingRef.current = false;
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
    <div className={`${styles.container}${shouldAnimate ? ` ${styles.animateIn}` : ""}`}>
      <div className={styles.branding}>
        <div className={styles.iconWrapper}>
          <div className={styles.iconGlow} />
          <span className={styles.iconImage}>
            <AppIcon size={64} color="brand_color" />
          </span>
        </div>
        <h1 className={styles.title}>Welcome to Squigit</h1>
      </div>
      <div className={styles.authWrapper}>
        {authState === "awaiting" && (
          <div className={styles.authState}>
            <Loader2 size={18} className={styles.spin} /> Awaiting
            Authentication
          </div>
        )}
        {authState === "success" && (
          <div className={styles.authState}>
            <CheckCircle2 size={14} /> Logged in as {userEmail}
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
