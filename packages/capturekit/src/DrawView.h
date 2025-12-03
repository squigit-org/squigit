/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#pragma once

#ifndef DRAWVIEW_H
#define DRAWVIEW_H

#include <QWidget>
#include <QImage>
#include <QPainterPath>
#include <QPropertyAnimation>

class DrawView : public QWidget
{
    Q_OBJECT
    Q_PROPERTY(qreal gradientOpacity READ gradientOpacity WRITE setGradientOpacity)

public:
    explicit DrawView(const QImage &background, QWidget *parent = nullptr);

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
    void cropAndFinish();

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
