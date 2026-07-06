/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import { getIdentityPort, type IdentityConfig } from "@squigit/core/ports";

export function useIdentityConfig() {
  const [config, setConfig] = useState<IdentityConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await getIdentityPort().getIdentityConfig();
      setConfig(data);
    } catch (e) {
      console.error("Failed to fetch identity config:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updatePrompt = useCallback(async (prompt: string) => {
    try {
      await getIdentityPort().setIdentityPrompt(prompt);
      setConfig((prev) => (prev ? { ...prev, prompt } : null));
    } catch (e) {
      console.error("Failed to update prompt:", e);
    }
  }, []);

  const attachSoul = useCallback(async (name: string, markdown: string) => {
    try {
      await getIdentityPort().setIdentitySoul(name, markdown);
      setConfig((prev) => (prev ? { ...prev, soul: { name } } : null));
    } catch (e) {
      console.error("Failed to attach soul:", e);
    }
  }, []);

  const detachSoul = useCallback(async () => {
    try {
      await getIdentityPort().removeIdentitySoul();
      setConfig((prev) => (prev ? { ...prev, soul: null } : null));
    } catch (e) {
      console.error("Failed to detach soul:", e);
    }
  }, []);

  return {
    config,
    loading,
    updatePrompt,
    attachSoul,
    detachSoul,
    refresh: fetchConfig,
  };
}
