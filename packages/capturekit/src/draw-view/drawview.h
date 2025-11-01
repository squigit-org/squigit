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

#pragma once

#ifndef DRAWVIEW_H
#define DRAWVIEW_H

#include <QWidget>
#include <QPainterPath>
#include <QPropertyAnimation>

class DrawView : public QWidget
{
    Q_OBJECT
    Q_PROPERTY(qreal gradientOpacity READ gradientOpacity WRITE setGradientOpacity)

public:
    explicit DrawView(int displayNum, const QString &imagePath, const QString &tmpPath, QWidget *parent = nullptr);

protected:
    void showEvent(QShowEvent *event) override;
    void mousePressEvent(QMouseEvent *event) override;
    void mouseMoveEvent(QMouseEvent *event) override;
    void mouseReleaseEvent(QMouseEvent *event) override;
    void keyPressEvent(QKeyEvent *event) override;
    void paintEvent(QPaintEvent *event) override;

private:
    qreal gradientOpacity() const;
    void setGradientOpacity(qreal opacity);
    void drawCursorCircle(QPainter &painter, const QPointF &center);
    void updateBounds(qreal x, qreal y);
    void clearCanvas();
    void cropAndSave();

    int m_displayNum;
    const QString m_tmpPath;

    QImage m_background;
    QPainterPath m_path;
    bool m_isDrawing = false;
    bool m_hasDrawing = false;

    QPointF m_smoothedPoint;
    QPointF m_currentMousePos;
    const qreal m_smoothingFactor = 0.2;
    qreal m_minX, m_maxX, m_minY, m_maxY;
    const qreal m_brushSize = 7;
    const qreal m_glowAmount = 0;
    const QColor m_brushColor = Qt::white;

    qreal m_gradientOpacity = 0.0;
    QPropertyAnimation *m_animation;
};

#endif // DRAWVIEW_H
