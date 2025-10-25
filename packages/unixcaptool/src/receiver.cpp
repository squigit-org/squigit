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

#include "receiver.h"
#include <QDebug>
#include <QUrl>
#include <QFile>
#include <QPixmap>
#include "utils.h"

void Receiver::handleResponse(uint response, const QVariantMap &results)
{
    bool ok = true;
    if (response != 0)
    {
        qWarning() << "Portal request failed or was cancelled. Response:" << response;
        ok = false;
    }
    else
    {
        QString uri = results.value("uri").toString();
        if (uri.isEmpty())
        {
            qWarning() << "Portal did not return a URI.";
            ok = false;
        }
        else
        {
            QString fullImagePath = QUrl(uri).toLocalFile();
            qDebug() << "Full desktop image saved to:" << fullImagePath;
            QPixmap fullDesktop(fullImagePath);
            if (fullDesktop.isNull())
            {
                qWarning() << "Failed to load pixmap from" << fullImagePath;
                ok = false;
            }
            else
            {
                ok = processFullPixmap(fullDesktop);
                if (ok) {
                    if (!QFile::remove(fullImagePath)) {
                        qWarning() << "Failed to remove full desktop image:" << fullImagePath;
                    }
                }
            }
        }
    }
    qDebug() << (ok ? "--- Capture Complete ---" : "--- Capture Failed ---");
    emit finished(ok);
}
