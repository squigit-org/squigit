import { useAppContext } from "@/app/providers/AppProvider";
import { APIKeySettings, ModelSettings } from "@/features/settings";
import styles from "./APIKeyStep.module.css";

export const APIKeyStep = () => {
  const app = useAppContext();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Let's give Squigit a brain</h1>
      </div>
      <div className={styles.contentWrapper}>
        <APIKeySettings isWizard={true} />
        <div className={styles.modelSection}>
          <ModelSettings
            localModel={app.system.startupModel}
            effort={app.system.startupEffort}
            ocrLanguage={app.system.startupOcrLanguage}
            updatePreferences={app.system.updatePreferences}
            isWizard={true}
          />
        </div>
      </div>
    </div>
  );
};
