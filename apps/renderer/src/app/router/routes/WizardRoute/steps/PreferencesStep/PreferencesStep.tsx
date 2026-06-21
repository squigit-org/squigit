import { useEffect } from "react";
import ThemePicker from "../../components/ThemePicker/ThemePicker";
import { useAppContext } from "@/app/providers/AppProvider";
import styles from "./PreferencesStep.module.css";

export const PreferencesStep = () => {
  const app = useAppContext();
  
  const savedTheme = app.system.wizardState?.data?.step_3?.theme || app.system.themePreference || "dark";

  useEffect(() => {
    // If not set yet, set the default
    if (!app.system.wizardState?.data?.step_3?.theme) {
      app.system.setWizardState({
        step: app.system.wizardState?.step ?? 3,
        isFinished: app.system.wizardState?.isFinished ?? false,
        data: {
          ...app.system.wizardState?.data,
          step_3: {
            theme: "dark"
          }
        }
      });
      app.system.updatePreferences({ theme: "dark" });
    }
  }, []);

  const handleThemeChange = (theme: "dark" | "light") => {
    // Update preferences so it affects GeneralSettings silently
    app.system.updatePreferences({ theme });
    
    // Update wizard state
    app.system.setWizardState({
      step: app.system.wizardState?.step ?? 3,
      isFinished: app.system.wizardState?.isFinished ?? false,
      data: {
        ...app.system.wizardState?.data,
        step_3: {
          theme
        }
      }
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Choose your theme</h1>
        <p className={styles.subtitle}>
          Select the appearance that suits you best. You can always change this later in settings.
        </p>
      </div>
      <div className={styles.pickerContainer}>
        <ThemePicker 
          value={savedTheme} 
          onChange={handleThemeChange} 
        />
      </div>
    </div>
  );
};
