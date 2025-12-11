/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export const OS_CONFIG: Record<string, {
    pathDisplay: (home: string) => string;
    packages: (arch: string) => Array<{ name: string; size: string }>;
    tasks: string[];
}> = {
    macos: {
        pathDisplay: () => "/Applications/Spatialshot.app",
        packages: (arch) => [
            { name: `spatialshot-mac-${arch}.zip`, size: "95 MiB" },
            { name: `capture-mac-${arch}.zip`, size: "40 MiB" },
            { name: `daemon-mac-${arch}.zip`, size: "1.5 MiB" },
        ],
        tasks: [
            "Install Application Bundle",
            "Configure Launch Agent",
            "Set Permissions (xattr)"
        ]
    },
    linux: {
        pathDisplay: (home) => `${home}/.local/share/spatialshot`,
        packages: () => [
            { name: "spatialshot-linux-x64.zip", size: "105 MiB" },
            { name: "capture-linux-x64.zip", size: "48 MiB" },
            { name: "daemon-linux-x64.zip", size: "1.5 MiB" },
        ],
        tasks: [
            "Install Binaries (XDG Compliant)",
            "Register Desktop Entry",
            "Register Global Hotkey (Wayland/X11)"
        ]
    }
};

export const REQUIRED_SPACE_MB = 450;
