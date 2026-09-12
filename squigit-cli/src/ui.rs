// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::state::{display_directory, AppState, NoticeKind, Suggestion, View};
use ratatui::layout::{Alignment, Constraint, Direction, Layout, Position, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem, ListState, Paragraph, Wrap};
use ratatui::Frame;

pub fn draw(frame: &mut Frame<'_>, state: &AppState) {
    match state.view {
        View::Auth => draw_auth(frame, state),
        _ => draw_shell(frame, state),
    }
}

fn draw_auth(frame: &mut Frame<'_>, state: &AppState) {
    let area = centered_rect(58, 11, frame.area());
    frame.render_widget(Clear, area);
    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Length(2),
            Constraint::Length(2),
            Constraint::Length(2),
        ])
        .split(area);

    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled("Squigit ", accent(state).add_modifier(Modifier::BOLD)),
            Span::raw(state.version),
        ]))
        .alignment(Alignment::Center)
        .block(Block::default().borders(Borders::ALL)),
        rows[0],
    );

    let choices = ["Login with browser", "Continue as guest"];
    for (index, choice) in choices.iter().enumerate() {
        let selected = state.auth_selection == index;
        let line = Line::from(vec![
            Span::styled(if selected { "> " } else { "  " }, accent(state)),
            Span::styled(
                *choice,
                if selected {
                    selected_style(state)
                } else {
                    Style::default()
                },
            ),
        ]);
        frame.render_widget(Paragraph::new(line), rows[index + 1]);
    }
    frame.render_widget(
        Paragraph::new("Up/Down to select | Enter to choose | Esc to quit")
            .alignment(Alignment::Center)
            .style(muted(state)),
        rows[3],
    );
}

fn draw_shell(frame: &mut Frame<'_>, state: &AppState) {
    let update_height = state
        .update_notice
        .as_ref()
        .map_or(0, |notice| notice.lines().count().min(4) as u16 + 2);
    let footer_height = 1;
    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(update_height),
            Constraint::Length(7),
            Constraint::Min(5),
            Constraint::Length(footer_height),
        ])
        .split(frame.area());

    if let Some(notice) = &state.update_notice {
        frame.render_widget(
            Paragraph::new(notice.as_str())
                .wrap(Wrap { trim: false })
                .style(warning(state))
                .block(Block::default().title(" Update ").borders(Borders::ALL)),
            rows[0],
        );
    }

    draw_header(frame, rows[1], state);
    match state.view {
        View::Home => draw_home(frame, rows[2], state),
        View::Menu => draw_menu(frame, rows[2], state),
        View::Prompt => draw_prompt(frame, rows[2], state),
        View::Reveal => draw_reveal(frame, rows[2], state),
        View::Ocr => draw_ocr(frame, rows[2], state),
        View::Auth => unreachable!(),
    }
    frame.render_widget(
        Paragraph::new("Enter select/send | Esc back/quit | F1 OCR | Ctrl+C quit")
            .alignment(Alignment::Center)
            .style(muted(state)),
        rows[3],
    );
}

fn draw_header(frame: &mut Frame<'_>, area: Rect, state: &AppState) {
    let model = state.model.strip_prefix("models/").unwrap_or(&state.model);
    let thread = state
        .current_thread
        .as_ref()
        .map(|thread| format!("{} ({})", thread.title, short_id(&thread.id)))
        .unwrap_or_else(|| "none".to_string());
    let lines = vec![
        Line::from(vec![
            Span::styled("Squigit ", accent(state).add_modifier(Modifier::BOLD)),
            Span::raw(format!("v{}", state.version)),
        ]),
        Line::from(vec![
            Span::styled("profile:   ", muted(state)),
            Span::raw(&state.profile_label),
        ]),
        Line::from(vec![
            Span::styled("model:     ", muted(state)),
            Span::raw(format!("{model} {}", state.effort)),
            Span::styled("  /model to change", muted(state)),
        ]),
        Line::from(vec![
            Span::styled("directory: ", muted(state)),
            Span::raw(display_directory(&state.cwd)),
        ]),
        Line::from(vec![
            Span::styled("thread:    ", muted(state)),
            Span::raw(thread),
        ]),
    ];
    frame.render_widget(
        Paragraph::new(lines).block(Block::default().borders(Borders::ALL)),
        area,
    );
}

fn draw_home(frame: &mut Frame<'_>, area: Rect, state: &AppState) {
    let suggestions_height = state.suggestions.len().min(12) as u16;
    let status_height = status_lines(state).len().max(1).min(8) as u16;
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(status_height),
            Constraint::Length(suggestions_height),
            Constraint::Length(3),
        ])
        .split(area);

    draw_status(frame, chunks[0], state);
    if !state.suggestions.is_empty() {
        draw_suggestions(frame, chunks[1], state);
    }
    let attachment_suffix = if state.attachments.is_empty() {
        String::new()
    } else {
        format!(" | {} attachment(s)", state.attachments.len())
    };
    frame.render_widget(
        Paragraph::new(format!("> {}", state.input)).block(
            Block::default()
                .title(format!(" Ask anything{attachment_suffix} "))
                .borders(Borders::ALL),
        ),
        chunks[2],
    );
    let cursor_width = state.input[..state.cursor].chars().count() as u16;
    let cursor_x = chunks[2]
        .x
        .saturating_add(2)
        .saturating_add(cursor_width)
        .min(chunks[2].right().saturating_sub(2));
    frame.set_cursor_position(Position::new(cursor_x, chunks[2].y + 1));
}

fn draw_status(frame: &mut Frame<'_>, area: Rect, state: &AppState) {
    let lines = status_lines(state);
    frame.render_widget(
        Paragraph::new(lines)
            .wrap(Wrap { trim: false })
            .block(Block::default().title(" Session ")),
        area,
    );
}

fn status_lines(state: &AppState) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    if state.profile_id.is_some() && !state.gemini_configured {
        lines.push(Line::styled(
            "[!] API key missing. Run /configure to add a Gemini API key.",
            warning(state),
        ));
    }
    if state.profile_id.is_none() {
        lines.push(Line::styled(
            "[guest] AI and API-key controls require /login.",
            muted(state),
        ));
    }
    for notice in &state.notices {
        let (prefix, style) = match notice.kind {
            NoticeKind::Info => ("[i]", accent(state)),
            NoticeKind::Success => ("[ok]", success(state)),
            NoticeKind::Warning => ("[!]", warning(state)),
            NoticeKind::Error => ("[error]", error(state)),
        };
        lines.push(Line::from(vec![
            Span::styled(format!("{prefix} "), style),
            Span::raw(notice.text.clone()),
        ]));
    }
    if let Some(task) = &state.busy {
        lines.push(Line::from(vec![
            Span::styled(format!("{} ", state.spinner()), accent(state)),
            Span::raw(task.clone()),
        ]));
    }
    if lines.is_empty() {
        lines.push(Line::styled(
            "Type / for commands or @ to mention a file.",
            muted(state),
        ));
    }
    lines
}

fn draw_suggestions(frame: &mut Frame<'_>, area: Rect, state: &AppState) {
    let items = state.suggestions.iter().map(|suggestion| match suggestion {
        Suggestion::Command {
            name, description, ..
        } => ListItem::new(Line::from(vec![
            Span::styled(format!("{name:<16}"), accent(state)),
            Span::raw(description.clone()),
        ])),
        Suggestion::File { name, path } => ListItem::new(Line::from(vec![
            Span::styled(format!("{name:<24}"), accent(state)),
            Span::styled(path.display().to_string(), muted(state)),
        ])),
    });
    let mut selection = ListState::default().with_selected(Some(state.selected));
    frame.render_stateful_widget(
        List::new(items)
            .highlight_symbol("> ")
            .highlight_style(selected_style(state)),
        area,
        &mut selection,
    );
}

fn draw_menu(frame: &mut Frame<'_>, area: Rect, state: &AppState) {
    if state.menu_items.is_empty() {
        frame.render_widget(
            Paragraph::new("Nothing is available here yet. Press Esc to return.")
                .style(muted(state))
                .block(
                    Block::default()
                        .title(format!(" {} ", state.menu_title))
                        .borders(Borders::ALL),
                ),
            area,
        );
        return;
    }
    let mut prior_section = "";
    let items = state.menu_items.iter().map(|item| {
        let section = if !item.section.is_empty() && item.section != prior_section {
            prior_section = &item.section;
            format!("{}: ", item.section)
        } else {
            String::new()
        };
        ListItem::new(Line::from(vec![
            Span::styled(section, muted(state)),
            Span::styled(item.label.clone(), accent(state)),
            Span::styled(
                if item.detail.is_empty() {
                    String::new()
                } else {
                    format!("  {}", item.detail)
                },
                muted(state),
            ),
        ]))
    });
    let mut selection = ListState::default().with_selected(Some(state.selected));
    frame.render_stateful_widget(
        List::new(items)
            .block(
                Block::default()
                    .title(format!(" {} ", state.menu_title))
                    .borders(Borders::ALL),
            )
            .highlight_symbol("> ")
            .highlight_style(selected_style(state)),
        area,
        &mut selection,
    );
}

fn draw_prompt(frame: &mut Frame<'_>, area: Rect, state: &AppState) {
    let modal = centered_rect(72, 8, area);
    frame.render_widget(Clear, modal);
    let rendered = if state.prompt_secret {
        "*".repeat(state.prompt_input.chars().count())
    } else {
        state.prompt_input.clone()
    };
    let lines = vec![
        Line::styled(state.prompt_hint.clone(), muted(state)),
        Line::raw(""),
        Line::from(vec![Span::styled("> ", accent(state)), Span::raw(rendered)]),
    ];
    frame.render_widget(
        Paragraph::new(lines).block(
            Block::default()
                .title(format!(" {} ", state.prompt_title))
                .borders(Borders::ALL),
        ),
        modal,
    );
    let width = state.prompt_input.chars().count() as u16;
    frame.set_cursor_position(Position::new(
        (modal.x + 3 + width).min(modal.right().saturating_sub(2)),
        modal.y + 4,
    ));
}

fn draw_reveal(frame: &mut Frame<'_>, area: Rect, state: &AppState) {
    let modal = centered_rect(68, 9, area);
    frame.render_widget(Clear, modal);
    let (provider, pin, input) = state
        .reveal
        .as_ref()
        .map(|reveal| {
            (
                reveal.provider.as_str(),
                reveal.pin.as_str(),
                reveal.input.as_str(),
            )
        })
        .unwrap_or(("API key", "------", ""));
    frame.render_widget(
        Paragraph::new(vec![
            Line::raw(format!("To reveal {provider}, type this PIN:")),
            Line::styled(pin.to_string(), warning(state).add_modifier(Modifier::BOLD)),
            Line::raw(""),
            Line::from(vec![Span::styled("> ", accent(state)), Span::raw(input)]),
        ])
        .alignment(Alignment::Center)
        .block(
            Block::default()
                .title(" Human check ")
                .borders(Borders::ALL),
        ),
        modal,
    );
    frame.set_cursor_position(Position::new(
        (modal.x + modal.width / 2 + input.len() as u16 / 2 + 1)
            .min(modal.right().saturating_sub(2)),
        modal.y + 4,
    ));
}

fn draw_ocr(frame: &mut Frame<'_>, area: Rect, state: &AppState) {
    frame.render_widget(
        Paragraph::new(Text::from(state.ocr_text.clone()))
            .wrap(Wrap { trim: false })
            .block(
                Block::default()
                    .title(" OCR text | Esc to return ")
                    .borders(Borders::ALL),
            ),
        area,
    );
}

fn centered_rect(width_percent: u16, height: u16, area: Rect) -> Rect {
    let width = area.width.saturating_mul(width_percent).saturating_div(100);
    let height = height.min(area.height);
    Rect::new(
        area.x + area.width.saturating_sub(width) / 2,
        area.y + area.height.saturating_sub(height) / 2,
        width,
        height,
    )
}

fn short_id(value: &str) -> &str {
    value.get(..8).unwrap_or(value)
}

fn accent(state: &AppState) -> Style {
    color(state, Color::Cyan)
}

fn muted(state: &AppState) -> Style {
    color(state, Color::DarkGray)
}

fn warning(state: &AppState) -> Style {
    color(state, Color::Yellow)
}

fn error(state: &AppState) -> Style {
    color(state, Color::Red)
}

fn success(state: &AppState) -> Style {
    color(state, Color::Green)
}

fn selected_style(state: &AppState) -> Style {
    accent(state).add_modifier(Modifier::BOLD | Modifier::REVERSED)
}

fn color(state: &AppState, color: Color) -> Style {
    if state.color {
        Style::default().fg(color)
    } else {
        Style::default()
    }
}
