/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#pragma once

#ifndef CAPTURE_H
#define CAPTURE_H

#include <vector>
#include <QImage>
#include <QRect>
#include <QString>
#include <QObject>
#include <algorithm>

struct CapturedFrame
{
    QImage image;
    QRect geometry;
    qreal devicePixelRatio;
    int index;
    QString name;
};

class CaptureEngine : public QObject
{
    Q_OBJECT

public:
    explicit CaptureEngine(QObject *parent = nullptr) : QObject(parent) {}
    virtual ~CaptureEngine() = default;
    virtual std::vector<CapturedFrame> captureAll() = 0;
    static void sortLeftToRight(std::vector<CapturedFrame> &frames)
    {
        std::sort(frames.begin(), frames.end(), [](const CapturedFrame &a, const CapturedFrame &b)
                  { return a.geometry.x() < b.geometry.x(); });
    }
};

#endif // CAPTURE_H
