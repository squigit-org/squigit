/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#pragma once

#ifndef RECEIVER_H
#define RECEIVER_H

#include <QObject>
#include <QVariantMap>

class Receiver : public QObject
{
    Q_OBJECT
public slots:
    void handleResponse(uint response, const QVariantMap &results);
signals:
    void finished(bool success);
};

#endif // RECEIVER_H
