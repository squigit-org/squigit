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

#include "utils.h"
#include <QGuiApplication>
#include <QScreen>
#include <QDebug>
#include <QProcess>
#include <QJsonDocument>
#include <QJsonArray>
#include <QJsonObject>
#include <algorithm>
#include "shell.h"

QRect desktopGeometry()
{
    QRect geometry;
    for (QScreen *const screen : QGuiApplication::screens())
    {
        qreal dpr = screen->devicePixelRatio();
        QRect scrRect = screen->geometry();
        scrRect.moveTo(QPoint(static_cast<int>(scrRect.x() * dpr), static_cast<int>(scrRect.y() * dpr)));
        scrRect.setSize(scrRect.size() * dpr);
        geometry = geometry.united(scrRect);
    }
    return geometry;
}

QRect logicalDesktopGeometry()
{
    QRect geometry;
    for (QScreen *const screen : QGuiApplication::screens())
    {
        QRect scrRect = screen->geometry();
        scrRect.moveTo(scrRect.x(), scrRect.y());
        geometry = geometry.united(scrRect);
    }
    return geometry;
}

bool processFullPixmap(const QPixmap &fullDesktop)
{
    if (fullDesktop.isNull())
    {
        return false;
    }
    QRect approxPhysGeo = desktopGeometry();
    QRect logicalGeo = logicalDesktopGeometry();
    qreal effectiveDpr;
    if (fullDesktop.size() == approxPhysGeo.size())
    {
        effectiveDpr = qApp->primaryScreen()->devicePixelRatio();
    }
    else if (fullDesktop.size() == logicalGeo.size())
    {
        effectiveDpr = 1.0;
    }
    else
    {
        effectiveDpr = static_cast<qreal>(fullDesktop.height()) / logicalGeo.height();
    }
    QPixmap mutableFull = fullDesktop;
    mutableFull.setDevicePixelRatio(effectiveDpr);
    QList<QScreen *> screens = qApp->screens();
    std::sort(screens.begin(), screens.end(), [](QScreen* a, QScreen* b) {
        return a->name() < b->name();
    });
    qDebug() << "Found" << screens.count() << "screen(s). Cropping...";
    QPoint minTopLeft(0, 0);
    for (QScreen *screen : screens)
    {
        QPoint tl = screen->geometry().topLeft();
        if (tl.x() < minTopLeft.x())
            minTopLeft.setX(tl.x());
        if (tl.y() < minTopLeft.y())
            minTopLeft.setY(tl.y());
    }
    int i = 1;
    bool success = true;
    for (QScreen *screen : screens)
    {
        QRect geometry = screen->geometry();
        geometry.translate(-minTopLeft.x(), -minTopLeft.y());
        QRect adjustedGeo(geometry.topLeft() * effectiveDpr, geometry.size() * effectiveDpr);
        qDebug() << "Screen" << i << "adjusted geometry:" << adjustedGeo;
        QPixmap cropped = mutableFull.copy(adjustedGeo);
        QString saveName = QString("%1.png").arg(i);
        if (!cropped.save(saveName))
        {
            qWarning() << "Failed to save" << saveName;
            success = false;
        }
        else
        {
            qDebug() << "Saved" << saveName;
        }
        i++;
    }
    return success;
}

bool tryWlroots()
{
    qDebug() << "Trying wlroots fallback with grim and wlr-randr...";

    if (!Shell::command_exists("wlr-randr") || !Shell::command_exists("grim")) {
        qWarning() << "wlr-randr or grim not found for wlroots fallback.";
        return false;
    }

    QProcess proc;
    proc.start("wlr-randr", QStringList() << "--json");
    if (!proc.waitForFinished() || proc.exitCode() != 0)
    {
        qWarning() << "wlr-randr failed to execute or returned error.";
        return false;
    }

    QByteArray output = proc.readAllStandardOutput();
    QJsonDocument doc = QJsonDocument::fromJson(output);
    if (!doc.isArray())
    {
        qWarning() << "wlr-randr output is not a JSON array.";
        return false;
    }
    QJsonArray monitors = doc.array();
    if (monitors.isEmpty())
    {
        qWarning() << "No monitors found in wlr-randr output.";
        return false;
    }

    QList<QScreen *> screens = qApp->screens();
    if (screens.isEmpty()) {
        qWarning() << "No screens found by Qt.";
        return false;
    }
    std::sort(screens.begin(), screens.end(), [](QScreen* a, QScreen* b) {
        return a->name() < b->name();
    });

    bool success = true;
    for (int i = 0; i < screens.size(); ++i) {
        QScreen *screen = screens.at(i);
        QRect screenGeom = screen->geometry();

        QJsonObject targetMonitor;
        for (const QJsonValue &val : monitors) {
            QJsonObject mon = val.toObject();
            if (!mon.value("active").toBool(false)) continue;

            QJsonObject rect = mon.value("rect").toObject();
            int x = rect.value("x").toInt();
            int y = rect.value("y").toInt();

            if (screenGeom.x() == x && screenGeom.y() == y) {
                targetMonitor = mon;
                break;
            }
        }

        if (targetMonitor.isEmpty()) {
            qWarning() << "Could not find matching monitor in wlr-randr for Qt screen at" << screenGeom.topLeft();
            success = false;
            continue;
        }

        QString name = targetMonitor.value("name").toString();
        if (name.isEmpty()) continue;

        QString fileName = QString("%1.png").arg(i + 1);
        qDebug() << "Capturing monitor" << name << "(Qt index" << i << ") to" << fileName;

        QProcess grimProc;
        grimProc.start("grim", QStringList() << "-o" << name << fileName);
        if (!grimProc.waitForFinished() || grimProc.exitCode() != 0)
        {
            qWarning() << "grim failed for monitor" << name;
            success = false;
        }
        else
        {
            qDebug() << "Saved" << fileName;
        }
    }

    return success;
}
