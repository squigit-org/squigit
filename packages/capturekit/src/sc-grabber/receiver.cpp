/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#include "receiver.h"
#include "helpers.h"
#include <QDebug>
#include <QUrl>
#include <QFile>
#include <QPixmap>

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
