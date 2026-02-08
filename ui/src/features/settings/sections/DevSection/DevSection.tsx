/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import styles from "./DevSection.module.css";
import { AIPromptBox } from "./AIPromptBox";

export const DevSection: React.FC = () => {
  return (
    <section className={styles.container} aria-labelledby="dev-heading">
      <header className={styles.sectionHeader}>
        <h2 id="dev-heading" className={styles.sectionTitle}>
          Dev
        </h2>
      </header>

      <div className={styles.content}>
        <AIPromptBox />
      </div>
    </section>
  );
};
