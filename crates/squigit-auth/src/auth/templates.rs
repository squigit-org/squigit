// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use base64::{engine::general_purpose, Engine as _};
use tiny_http::{Header, Response};

use crate::Result;

const SUCCESS_TEMPLATE: &str = include_str!("../../assets/oauth/success.html");
const FAILURE_TEMPLATE: &str = include_str!("../../assets/oauth/failure.html");
pub(super) const FAVICON_BYTES: &[u8] = include_bytes!("../../assets/oauth/favicon.png");

pub(super) fn respond_success(
    request: tiny_http::Request,
    title: &str,
    content: &str,
) -> Result<()> {
    respond_html(
        request,
        SUCCESS_TEMPLATE,
        title,
        content,
        "Confirmation",
        false,
    )
}

pub(super) fn respond_failure(
    request: tiny_http::Request,
    title: &str,
    content: &str,
) -> Result<()> {
    respond_html(request, FAILURE_TEMPLATE, title, content, "Error", true)
}

fn respond_html(
    request: tiny_http::Request,
    template: &str,
    title: &str,
    content: &str,
    breadcrumb: &str,
    is_error: bool,
) -> Result<()> {
    let title_color = if is_error { "#d93025" } else { "#202124" };
    let dynamic_style = format!("<style>:root {{ --title-color: {}; }}</style>", title_color);
    let favicon_href = format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(FAVICON_BYTES)
    );
    let html = template
        .replace("${title}", title)
        .replace("${dynamicStyle}", &dynamic_style)
        .replace("${faviconHref}", &favicon_href)
        .replace("${breadcrumb}", breadcrumb)
        .replace("${bodyContent}", content);

    let response = Response::from_string(html).with_header(
        Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap(),
    );
    request.respond(response)?;
    Ok(())
}
