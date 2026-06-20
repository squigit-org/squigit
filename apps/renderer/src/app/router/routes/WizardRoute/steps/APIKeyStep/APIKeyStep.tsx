import React from "react";
import { useAppContext } from "@/app/providers/AppProvider";
import { APIKeySettings, ModelSettings } from "@/features/settings";
import styles from "./APIKeyStep.module.css";

export const APIKeyStep = () => {
  const app = useAppContext();

  return (
    <div className={styles.container}>
      <APIKeySettings
        providerApiKey={app.system.apiKey}
        imgbbKey={app.system.imgbbKey}
        onSetAPIKey={app.system.handleSetAPIKey}
        isGuest={!app.system.activeProfile}
        isWizard={true}
      />
      <div className={styles.modelSection}>
        <ModelSettings
          localModel={app.system.startupModel}
          ocrLanguage={app.system.startupOcrLanguage}
          updatePreferences={app.system.updatePreferences}
          isWizard={true}
        />
      </div>
    </div>
  );
};
