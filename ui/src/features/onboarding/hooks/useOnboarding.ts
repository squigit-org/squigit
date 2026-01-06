/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";

export const useOnboarding = () => {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  const completeOnboarding = () => {
    setHasCompletedOnboarding(true);
    localStorage.setItem("onboarding_completed", "true");
  };

  return {
    hasCompletedOnboarding,
    completeOnboarding,
  };
};
