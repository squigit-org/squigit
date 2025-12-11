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
            { name: `spatialshot-mac-${arch}.zip`, size: "95 MB" },
            { name: `capture-mac-${arch}.zip`, size: "40 MB" },
            { name: `daemon-mac-${arch}.zip`, size: "1.5 MB" },
            { name: `spatialshot-setup-mac-${arch}.zip`, size: "10 MB" },
        ],
        tasks: [
            "Install Application Bundle",
            "Configure Launch Agent",
            "Set Permissions (xattr)",
            "Register Updater"
        ]
    },
    linux: {
        pathDisplay: (home) => `${home}/.local/share/spatialshot`,
        packages: (_arch) => [
            { name: "spatialshot-linux-x64.zip", size: "105 MB" },
            { name: "capture-linux-x64.zip", size: "48 MB" },
            { name: "daemon-linux-x64.zip", size: "1.5 MB" },
            { name: "spatialshot-setup-linux-x64.zip", size: "10 MB" },
        ],
        tasks: [
            "Install Binaries",
            "Register Desktop Entry",
            "Register Global Hotkey (Wayland/X11)",
            "Register Updater"
        ]
    }
};

export const REQUIRED_SPACE_MB = 450;
