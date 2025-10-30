/**
 * Copyright (C) 2025  a7mddra-spatialshot
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

#include "Window.h"
#include <QApplication>
#include <QScreen>
#include <QDir>
#include <QDebug>
#include <QStandardPaths>
#include <QFileInfo>
#include <algorithm>

int main(int argc, char *argv[]) {
    
#ifdef Q_OS_LINUX
    qputenv("QT_QPA_PLATFORM", "xcb");
#endif

    QApplication app(argc, argv);
    app.setApplicationName("drawview");
    app.setOrganizationName("spatialshot");  
    app.setApplicationVersion("1.0.0");

    QString tmpPath;
    QString cacheBase;

#ifdef Q_OS_WIN
    cacheBase = QStandardPaths::writableLocation(QStandardPaths::GenericDataLocation);
#else
    cacheBase = QStandardPaths::writableLocation(QStandardPaths::GenericCacheLocation);
#endif

    if (cacheBase.isEmpty()) {
        qCritical() << "FATAL: Could not determine standard cache location.";
        return 1;
    }
    
    tmpPath = QDir(cacheBase).filePath("spatialshot/tmp");

    QDir tmpDir(tmpPath);
    if (!tmpDir.exists()) {
        qWarning() << "Temporary directory does not exist, attempting to create:" << tmpPath;
        if (!tmpDir.mkpath(".")) {
            qCritical() << "FATAL: Could not create temporary directory:" << tmpPath;
            return 1;
        }
    }

    QList<QScreen*> screens = QGuiApplication::screens();
    std::sort(screens.begin(), screens.end(), [](QScreen* a, QScreen* b) {
        return a->name() < b->name();
    });
    QScreen* primaryScreen = QGuiApplication::primaryScreen();

    qDebug() << "Spatialshot started. Using tmp path:" << tmpPath;
    qDebug() << "Available displays:";
    for (int i = 0; i < screens.size(); ++i) {
        QScreen* screen = screens[i];
        qDebug() << QString("  Display %1 (Qt Index %2): %3, bounds: %4x%5+%6+%7, primary: %8")
                    .arg(i + 1)
                    .arg(i)
                    .arg(screen->name().isEmpty() ? "Unnamed" : screen->name())
                    .arg(screen->geometry().width())
                    .arg(screen->geometry().height())
                    .arg(screen->geometry().x())
                    .arg(screen->geometry().y())
                    .arg(screen == primaryScreen);
    }

    QList<MainWindow*> windows;
    for (int i = 0; i < screens.size(); ++i) {
        QScreen* screen = screens[i];
        int currentMonitorNum = i + 1;

        QString imagePath = QDir(tmpPath).filePath(QString("%1.png").arg(currentMonitorNum));
        if (!QFileInfo::exists(imagePath)) {
            qWarning() << "Screenshot PNG not found for monitor" << currentMonitorNum << ":" << imagePath;
            continue;
        }

        qDebug() << "Creating window for monitor" << currentMonitorNum << "(Qt Index" << i << ") with image" << imagePath;
        
        MainWindow* win = new MainWindow(currentMonitorNum, imagePath, tmpPath, screen); 
        
        windows.append(win);
        win->show();
    }

    if (windows.isEmpty()) {
        qCritical() << "FATAL: Could not create any windows. No valid monitors or PNGs found.";
        return 1;
    }

    qDebug() << "Entering Qt event loop...";
    int result = app.exec();
    qDebug() << "Exiting Qt event loop with code" << result;
    return result;
}
