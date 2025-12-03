/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#ifndef UNICODE
#define UNICODE
#endif

#include <windows.h>
#include <gdiplus.h>
#include <shlobj.h>
#include <vector>
#include <string>
#include <algorithm>
#include <filesystem>
#include <cwchar>

#pragma comment (lib,"Gdiplus.lib")
#pragma comment (lib,"Shell32.lib")
#pragma comment (lib,"User32.lib")
#pragma comment (lib,"Gdi32.lib")
#pragma comment (lib,"Ole32.lib")

using namespace Gdiplus;
namespace fs = std::filesystem;

struct MonitorInfo {
    std::wstring name;
    RECT rect;
};

int GetEncoderClsid(const WCHAR* format, CLSID* pClsid) {
    UINT  num = 0;
    UINT  size = 0;
    GetImageEncodersSize(&num, &size);
    if (size == 0) return -1;
    ImageCodecInfo* pImageCodecInfo = (ImageCodecInfo*)(malloc(size));
    if (pImageCodecInfo == NULL) return -1;
    GetImageEncoders(num, size, pImageCodecInfo);
    for (UINT j = 0; j < num; ++j) {
        if (wcscmp(pImageCodecInfo[j].MimeType, format) == 0) {
            *pClsid = pImageCodecInfo[j].Clsid;
            free(pImageCodecInfo);
            return j;
        }
    }
    free(pImageCodecInfo);
    return -1;
}

BOOL CALLBACK MonitorEnumProc(HMONITOR hMonitor, HDC hdcMonitor, LPRECT lprcMonitor, LPARAM dwData) {
    std::vector<MonitorInfo>* pMonitors = reinterpret_cast<std::vector<MonitorInfo>*>(dwData);
    MONITORINFOEXW mi;
    mi.cbSize = sizeof(MONITORINFOEXW);
    if (GetMonitorInfoW(hMonitor, &mi)) {
        MonitorInfo info;
        info.name = mi.szDevice;
        info.rect = mi.rcMonitor;
        pMonitors->push_back(info);
    }
    return TRUE;
}

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, PWSTR pCmdLine, int nCmdShow) {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    GdiplusStartupInput gdiplusStartupInput;
    ULONG_PTR gdiplusToken;
    GdiplusStartup(&gdiplusToken, &gdiplusStartupInput, NULL);

    PWSTR localAppDataPath = NULL;
    if (SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, NULL, &localAppDataPath) != S_OK) {
        return 1;
    }

    fs::path saveDir = fs::path(localAppDataPath) / "spatialshot" / "tmp";
    CoTaskMemFree(localAppDataPath);

    try {
        if (fs::exists(saveDir)) {
            fs::remove_all(saveDir);
        }
        fs::create_directories(saveDir);
    } catch (...) {
        return 1;
    }

    std::vector<MonitorInfo> monitors;
    EnumDisplayMonitors(NULL, NULL, MonitorEnumProc, reinterpret_cast<LPARAM>(&monitors));

    std::sort(monitors.begin(), monitors.end(), [](const MonitorInfo& a, const MonitorInfo& b) {
        return a.name < b.name;
    });

    if (monitors.empty()) return 1;

    HDC hScreenDC = GetDC(NULL);
    CLSID pngClsid;
    GetEncoderClsid(L"image/png", &pngClsid);

    int count = 1;
    for (const auto& monitor : monitors) {
        int w = monitor.rect.right - monitor.rect.left;
        int h = monitor.rect.bottom - monitor.rect.top;
        int x = monitor.rect.left;
        int y = monitor.rect.top;

        HDC hMemoryDC = CreateCompatibleDC(hScreenDC);
        HBITMAP hBitmap = CreateCompatibleBitmap(hScreenDC, w, h);
        HBITMAP hOldBitmap = (HBITMAP)SelectObject(hMemoryDC, hBitmap);

        BitBlt(hMemoryDC, 0, 0, w, h, hScreenDC, x, y, SRCCOPY);

        Bitmap* image = Bitmap::FromHBITMAP(hBitmap, NULL);
        std::wstring fileName = std::to_wstring(count) + L".png";
        fs::path fullPath = saveDir / fileName;
        
        image->Save(fullPath.c_str(), &pngClsid, NULL);

        delete image;
        SelectObject(hMemoryDC, hOldBitmap);
        DeleteObject(hBitmap);
        DeleteDC(hMemoryDC);
        count++;
    }

    ReleaseDC(NULL, hScreenDC);
    GdiplusShutdown(gdiplusToken);

    return 0;
}
