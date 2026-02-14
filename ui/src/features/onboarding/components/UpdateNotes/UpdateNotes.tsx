import React, { useMemo, useState } from "react";
import { OnboardingShell } from "@/shell/containers";
import { useShellContext } from "@/shell/context";
import { getPendingUpdate } from "@/hooks/useUpdateCheck";
import styles from "./UpdateNotes.module.css";
import { ChevronRight } from "lucide-react";
import clsx from "clsx";

interface UpdateSectionProps {
  title: string;
  items: string[];
  defaultOpen?: boolean;
}

const UpdateSection: React.FC<UpdateSectionProps> = ({
  title,
  items,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!items || items.length === 0) return null;

  return (
    <div className={styles.section}>
      <div
        className={styles.sectionHeader}
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
      >
        <ChevronRight
          className={clsx(styles.chevron, isOpen && styles.chevronRotate)}
        />
        <span className={styles.sectionTitle}>{title}</span>
      </div>
      {isOpen && (
        <div className={styles.sectionContent}>
          <ul className={styles.sectionList}>
            {items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export const UpdateNotes: React.FC = () => {
  const shell = useShellContext();
  const update = useMemo(() => getPendingUpdate(), []);

  // Sort order for sections
  const SECTION_ORDER = ["New Features", "Bug Fixes", "UI Improvements"];

  if (!update) {
    return (
      <OnboardingShell>
        <div className={styles.container}>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted-foreground)",
            }}
          >
            You are up to date
          </div>
        </div>
      </OnboardingShell>
    );
  }

  const sections = update.sections || {};
  const hasSections = Object.keys(sections).length > 0;

  return (
    <OnboardingShell allowScroll={false} contentClassName={styles.container}>
      <div className={styles.scrollableContent}>
        <div className={styles.header}>
          <div className={styles.title}>SnapLLM v{update.version} is Here</div>
          <div className={styles.subtitle}>
            Explore what's new in this release
          </div>
        </div>

        {hasSections ? (
          <>
            {SECTION_ORDER.map((sectionTitle) => (
              <UpdateSection
                key={sectionTitle}
                title={sectionTitle}
                items={sections[sectionTitle]}
                defaultOpen={sectionTitle === "New Features"}
              />
            ))}
            {/* Render any other sections that might exist in the future */}
            {Object.keys(sections)
              .filter((k) => !SECTION_ORDER.includes(k))
              .map((sectionTitle) => (
                <UpdateSection
                  key={sectionTitle}
                  title={sectionTitle}
                  items={sections[sectionTitle]}
                />
              ))}
          </>
        ) : (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Release Notes</span>
            </div>
            <div className={styles.sectionContent}>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  margin: 0,
                }}
              >
                {update.notes}
              </pre>
            </div>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.status}>
          <span className={styles.size}>Size: ~14.5MB</span>
          <span className={styles.downloading}>Ready to Install</span>
        </div>
        <button
          className={styles.updateButton}
          onClick={() => shell.handleSystemAction("update_now")}
        >
          Update Now
        </button>
      </div>
    </OnboardingShell>
  );
};
