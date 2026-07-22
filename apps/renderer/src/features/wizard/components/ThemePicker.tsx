import { useState } from "react";
import styles from "./ThemePicker.module.css";

export interface ThemePickerProps {
  defaultValue?: "dark" | "light";
  value?: "dark" | "light";
  onChange?: (theme: "dark" | "light") => void;
}

export default function ThemePicker({
  defaultValue = "dark",
  value,
  onChange,
}: ThemePickerProps = {}) {
  const [localTheme, setLocalTheme] = useState<"dark" | "light">(defaultValue);
  const selectedTheme = value !== undefined ? value : localTheme;

  const handleSelect = (theme: "dark" | "light") => {
    setLocalTheme(theme);
    onChange?.(theme);
  };

  return (
    <div className={styles.pickerContainer}>
      {/* Dark Theme Option */}
      <button
        onClick={() => handleSelect("dark")}
        className={`${styles.themeButton} ${styles.darkButton} ${selectedTheme === "dark" ? styles.selected : ""}`}
        aria-label="Select Dark Theme"
      >
        <div className={`${styles.innerWindow} ${styles.darkInner}`}>
          <div className={`${styles.sidebar} ${styles.darkSidebar}`}>
            <div className={styles.windowControls}>
              <div className={`${styles.dot} ${styles.darkDot}`}></div>
              <div className={`${styles.dot} ${styles.darkDot}`}></div>
              <div className={`${styles.dot} ${styles.darkDot}`}></div>
            </div>
            <div className={styles.navItems}>
              <div className={`${styles.line} ${styles.w80} ${styles.darkLine}`}></div>
              <div className={`${styles.line} ${styles.w100} ${styles.darkLine}`}></div>
              <div className={`${styles.line} ${styles.w60} ${styles.darkLine}`}></div>
            </div>
            <div className={styles.bottomItems}>
              <div className={`${styles.circle} ${styles.darkLine}`}></div>
              <div className={`${styles.line} ${styles.w8} ${styles.darkLine}`}></div>
            </div>
          </div>

          <div className={`${styles.mainContentArea} ${styles.darkMain}`}>
            <div className={`${styles.mainContentWrapper} ${styles.darkWrapper}`}>
              <div className={styles.contentPadding}>
                <div className={`${styles.headerLine1} ${styles.darkHeader1}`}></div>
                <div className={`${styles.headerLine2} ${styles.darkHeader2}`}></div>

                <div className={styles.contentGrid}>
                  <div className={`${styles.gridItem} ${styles.darkGridItem}`}></div>
                  <div className={`${styles.gridItem} ${styles.darkGridItem}`}></div>
                  <div className={`${styles.gridItem} ${styles.darkGridItem}`}></div>
                  <div className={`${styles.gridItem} ${styles.darkGridItem}`}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </button>

      {/* Light Theme Option */}
      <button
        onClick={() => handleSelect("light")}
        className={`${styles.themeButton} ${styles.lightButton} ${selectedTheme === "light" ? styles.selected : ""}`}
        aria-label="Select Light Theme"
      >
        <div className={`${styles.innerWindow} ${styles.lightInner}`}>
          <div className={`${styles.sidebar} ${styles.lightSidebar}`}>
            <div className={styles.windowControls}>
              <div className={`${styles.dot} ${styles.lightDot}`}></div>
              <div className={`${styles.dot} ${styles.lightDot}`}></div>
              <div className={`${styles.dot} ${styles.lightDot}`}></div>
            </div>
            <div className={styles.navItems}>
              <div className={`${styles.line} ${styles.w80} ${styles.lightLine}`}></div>
              <div className={`${styles.line} ${styles.w100} ${styles.lightLine}`}></div>
              <div className={`${styles.line} ${styles.w60} ${styles.lightLine}`}></div>
            </div>
            <div className={styles.bottomItems}>
              <div className={`${styles.circle} ${styles.lightLine}`}></div>
              <div className={`${styles.line} ${styles.w8} ${styles.lightLine}`}></div>
            </div>
          </div>

          <div className={`${styles.mainContentArea} ${styles.lightMain}`}>
            <div className={`${styles.mainContentWrapper} ${styles.lightWrapper}`}>
              <div className={styles.contentPadding}>
                <div className={`${styles.headerLine1} ${styles.lightHeader1}`}></div>
                <div className={`${styles.headerLine2} ${styles.lightHeader2}`}></div>

                <div className={styles.contentGrid}>
                  <div className={`${styles.gridItem} ${styles.lightGridItem}`}></div>
                  <div className={`${styles.gridItem} ${styles.lightGridItem}`}></div>
                  <div className={`${styles.gridItem} ${styles.lightGridItem}`}></div>
                  <div className={`${styles.gridItem} ${styles.lightGridItem}`}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
