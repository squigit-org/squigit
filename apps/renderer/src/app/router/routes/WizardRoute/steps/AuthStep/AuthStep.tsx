import React from "react";
import { useAppContext } from "@/app/providers/AppProvider";
import { AuthButton } from "@/app/layout/frame/AuthButton";
import { AppLogo } from "@/components/icons/brand-icons";
import styles from "./AuthStep.module.css";

interface AuthStepProps {
  onNext: () => void;
}

export const AuthStep: React.FC<AuthStepProps> = ({ onNext }) => {
  const app = useAppContext();

  const isDone = !!app.system.activeProfile;

  return (
    <div className={styles.container}>
      <div className={styles.branding}>
        <AppLogo size={64} color="var(--c-raw-050)" />
        <h1 className={styles.title}>Welcome to Squigit</h1>
      </div>
      <div className={styles.authWrapper}>
        <AuthButton
          onLogin={app.handleAddAccount}
          onCancel={app.system.cancelAuth}
          isLoading={app.system.switchingProfileId === "creating_account"}
          wizard={true}
        />
      </div>
    </div>
  );
};
